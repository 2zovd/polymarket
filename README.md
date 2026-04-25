# Polymarket Trading Toolkit

Autonomous whale-tracking and copy-trading bot for Polymarket — built in TypeScript.

- Scores wallets by ROI / win_rate / p-value (Kelly criterion)
- Tracks profitable whale positions in real time via Polymarket Data API
- Automatically copies new entries through the CLOB API
- Discovers top traders from Dune Analytics (query 6979866)
- Two-tier monitor: trade stream (60s) + full snapshot (5 min) for fast detection at low API cost
- Sends Telegram alerts on every executed signal
- Runs as a PM2 daemon with auto-restart on crash and reboot

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+, TypeScript strict |
| Package manager | pnpm |
| CLI | commander |
| DB | SQLite + Drizzle ORM (WAL mode) |
| Validation | Zod |
| Logging | pino (JSON in prod, pino-pretty in dev) |
| Polymarket | @polymarket/clob-client |
| Wallet / Signing | viem |
| Testing | Vitest |
| Linting | Biome |

---

## Prerequisites

- Node.js 20+, pnpm 9+
- Polymarket account with a wallet on Polygon
- Polygon RPC URL (Alchemy or Infura recommended — public RPC is rate-limited)

---

## Installation

```bash
git clone <repo-url>
cd polymarket
pnpm install
cp .env.example .env
pnpm db:migrate
```

---

## Configuration

Two-file secrets model:

| File | Purpose | Gitignored? |
|---|---|---|
| `~/.polymarket-secrets` | Private key, API credentials, Dune/Telegram keys | Stored outside repo |
| `.env` | Non-sensitive config (API URLs, flags, thresholds) | Yes |

### Create ~/.polymarket-secrets

```bash
cat >> ~/.polymarket-secrets << 'EOF'
# ─── Required ────────────────────────────────────────────────────────────────
PRIVATE_KEY=0x<your_64_char_hex_private_key>
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/<YOUR_KEY>

# ─── L2 API credentials (generate via: pnpm dev orders derive-keys) ──────────
# CLOB_API_KEY=...
# CLOB_SECRET=...
# CLOB_PASSPHRASE=...

# ─── Optional integrations ───────────────────────────────────────────────────
# DUNE_API_KEY=...          # enables whales discover + weekly auto-discovery
# TELEGRAM_BOT_TOKEN=...    # enables signal alerts
# TELEGRAM_CHAT_ID=...      # your chat/channel ID (negative for channels)
EOF
```

Generate L2 API credentials (one-time):

```bash
pnpm dev orders derive-keys
# Copy CLOB_API_KEY / CLOB_SECRET / CLOB_PASSPHRASE → ~/.polymarket-secrets
```

---

## Quick Start

```bash
# 1. Start background data collectors
pnpm dev cron

# 2. Discover and score profitable whale wallets via Dune Analytics
pnpm dev whales discover               # fetches top-500, scores each via Data API
pnpm dev whales top --profitable       # review: should show 40-80 flagged wallets

# 3. Test the copy trading engine (DRY_RUN=true — no real orders)
pnpm dev copy start --once             # single cycle, inspect signals
pnpm dev copy status                   # review detections and skip reasons

# 4. Run as a persistent daemon
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup                # auto-restart on reboot
```

---

## Commands

| Command | Description |
|---|---|
| `markets list [--limit N] [--closed] [--tag X]` | List markets from Gamma API |
| `markets get <slug\|conditionId>` | Single market by slug or condition ID |
| `markets traders <conditionId> [--limit N]` | Top traders for a market |
| `orderbook <tokenId>` | Live CLOB orderbook |
| `orders list` | Open orders for configured wallet |
| `orders history` | Trade history for configured wallet |
| `orders derive-keys` | Generate L2 API credentials (run once) |
| `wallet positions <address>` | Open positions for any wallet |
| `whales scan` | Re-score all wallets accumulated from trade stream |
| `whales discover [--query N] [--limit N]` | Fetch wallets from Dune and score them |
| `whales seed <file.csv>` | Score wallets from a CSV/TXT file of addresses |
| `whales top [-n N] [--profitable] [--all]` | Top wallets by ROI |
| `whales show <address>` | Full stats for a specific wallet |
| `copy start [--once]` | Start the monitor loop (add `--once` to test one cycle) |
| `copy status [-n N] [--live]` | Recent signals with skip reasons |
| `copy positions [--history]` | Open positions; add `--history` for resolved P&L |
| `cron` | Start all collectors on schedule |

---

## How Copy Trading Works

### Detection Architecture (two-tier)

```
                    ┌─ Trade Stream (every 60s) ──────────────────────────┐
                    │  GET /trades?since=cursor  →  1 API call             │
                    │  Filter: which profitable whales traded?             │
                    │  For each active whale: fetch /positions  (0–5 calls)│
                    │  → diff → signal pipeline                            │
                    └─────────────────────────────────────────────────────┘

                    ┌─ Full Snapshot (every 5 min) ────────────────────────┐
                    │  GET /positions for ALL 72 whales  (72 API calls)    │
                    │  → update watched_positions snapshot                  │
                    │  → resolve settled open_positions                    │
                    └─────────────────────────────────────────────────────┘
```

Detection latency: **~60 seconds** (was 5 minutes). API load: **−80%** vs previous architecture.

### Signal Pipeline

```
Dune Analytics ──→ whales discover ──→ wallet_stats (ROI, p-value, Brier score)
                                                │
                 Trade stream or full snapshot detects new/grown position
                                                │
                            generateSignal — quality gates:
                              · whale ROI ≥ MIN_WHALE_ROI (2%)
                              · p-value < MIN_WHALE_PVALUE (5%)
                              · resolvedTrades > MIN_WHALE_TRADES (30)
                              · initialValue ≥ MIN_POSITION_USDC ($10)
                              · market active in DB
                              · market expires in > MIN_MARKET_HOURS_REMAINING (4h)
                              · not already in open_positions (dedup)
                              · edge = whaleAvgPrice − currentAsk ≥ MIN_EDGE_PCT (1%)
                                                │
                   kellySize = (edge / (1 − ask)) × KELLY_CAP × PORTFOLIO_SIZE
                   capped at MAX_ORDER_SIZE_USDC
                                                │
                   placeLimitOrder → signals table → open_positions → Telegram
```

### Wallet Scoring

Wallets are scored using three criteria — all must pass for `isProfitable = true`:

- **ROI > 0** and **p-value < 0.05** (statistically significant positive returns)
- **resolvedTrades ≥ 30** (enough history to trust the signal)

Scoring runs via the `collectWalletStats` collector (every 6h), `refreshStaleWallets` (daily for wallets not updated in 7+ days), and `collectDuneWallets` (weekly auto-discovery on Sundays).

---

## Copy Trading Config

| Variable | Default | Description |
|---|---|---|
| `DRY_RUN` | `true` | No real orders sent — log as dry-run |
| `MAX_ORDER_SIZE_USDC` | `100` | Hard cap per single order |
| `PORTFOLIO_SIZE` | `1000` | Capital base for Kelly sizing |
| `KELLY_CAP` | `0.25` | Fraction of full Kelly (25% = conservative) |
| `STREAM_INTERVAL_SECONDS` | `60` | Trade stream polling frequency |
| `MONITOR_INTERVAL_SECONDS` | `300` | Full snapshot refresh frequency |
| `MIN_WHALE_ROI` | `0.02` | Minimum whale ROI to copy (2%) |
| `MIN_WHALE_PVALUE` | `0.05` | Maximum p-value for significance |
| `MIN_WHALE_TRADES` | `30` | Minimum resolved trades required |
| `MIN_EDGE_PCT` | `0.01` | Minimum price edge to enter (1%) |
| `MIN_POSITION_USDC` | `10` | Skip whale positions below this size |
| `MIN_MARKET_HOURS_REMAINING` | `4` | Skip markets expiring within N hours |
| `MAX_OPEN_POSITIONS` | `20` | Max simultaneous copy positions |

---

## PM2 Daemon

```bash
pm2 start ecosystem.config.cjs                  # start
pm2 logs polymarket-monitor                      # tail live logs
pm2 logs polymarket-monitor --lines 50           # last 50 lines
pm2 restart polymarket-monitor --update-env      # restart after .env changes
pm2 stop polymarket-monitor
pm2 save && pm2 startup                          # persist across reboots
```

**What healthy logs look like:**
```
{"module":"stream","tradesScanned":150,"msg":"..."}          # every ~60s
{"module":"stream","active":2,"msg":"Whales detected..."}    # when whale trades
{"module":"monitor","whales":72,"msg":"Monitor cycle started"} # every 5 min
{"module":"monitor","msg":"Monitor cycle complete"}
```

---

## Development

```bash
pnpm typecheck        # TypeScript strict check, no emit
pnpm lint             # Biome lint + format check
pnpm lint:fix         # auto-fix lint issues
pnpm test             # Vitest (run once)
pnpm db:generate      # generate Drizzle migration after schema changes
pnpm db:migrate       # apply pending migrations
pnpm db:studio        # Drizzle Studio (DB GUI)
pnpm ci               # typecheck + lint + test
```

---

## Project Structure

```
src/
├── index.ts              CLI entry point
├── types.ts              Shared types + AppConfig interface
├── cron.ts               Cron scheduler (node-cron)
├── api/
│   ├── clob.ts           CLOB API wrapper (orders, orderbook, placeLimitOrder)
│   ├── gamma.ts          Gamma API client (market metadata, resolved outcomes)
│   ├── data.ts           Data API client (trades stream, wallet activity, positions)
│   └── dune.ts           Dune Analytics API client (query results, address extraction)
├── commands/
│   ├── markets.ts        markets list|get|traders
│   ├── orderbook.ts      orderbook <tokenId>
│   ├── orders.ts         orders list|history|derive-keys
│   ├── wallet.ts         wallet positions
│   ├── whales.ts         whales scan|discover|top|seed|show
│   ├── copy.ts           copy start|status|positions
│   └── cron.ts           background collectors entry
├── collectors/
│   ├── markets.ts        market metadata + resolved outcomes (Gamma API)
│   ├── trades.ts         global trade stream collector (Data API)
│   ├── positions.ts      position snapshots collector
│   └── wallets.ts        wallet scorer + Dune seeder + stale refresh
├── analytics/
│   └── wallet-scorer.ts  ROI / Brier score / two-tailed t-test p-value
├── engine/
│   ├── monitor.ts        two-tier polling loop (stream + full snapshot)
│   ├── signal.ts         quality gates + edge calculation
│   ├── sizer.ts          Kelly criterion sizing
│   └── executor.ts       order placement + signal/position DB logging
├── db/
│   ├── index.ts          Drizzle + better-sqlite3 setup (WAL mode)
│   ├── schema.ts         all table definitions
│   └── migrations/       auto-generated SQL migrations
└── lib/
    ├── config.ts         Zod env validation, AppConfig singleton
    ├── logger.ts         pino logger singleton
    └── telegram.ts       Telegram Bot API alert sender
ecosystem.config.cjs      PM2 process config
```

### Database Schema

| Table | Purpose |
|---|---|
| `markets` | Market metadata from Gamma API (question, status, outcome prices) |
| `trades` | Global trade stream from Data API |
| `positions` | Wallet position snapshots from Gamma |
| `wallet_stats` | Scored whale wallets (ROI, Brier, p-value, isProfitable, isSharp) |
| `watched_positions` | Current whale position snapshots for change detection |
| `signals` | All generated signals (executed, skipped, dry-run, error) with skip reasons |
| `open_positions` | Active copy trades tracked until market resolution and P&L calc |
| `anomalies` | Detected anomalies (volume spikes, coordinated entries) |

---

## Safety Model

- `DRY_RUN=true` by default — no orders placed, signals logged as `dry-run`
- `MAX_ORDER_SIZE_USDC` — hard cap enforced before every `placeLimitOrder` call
- `MAX_OPEN_POSITIONS` — concurrent position cap enforced per cycle and mid-cycle
- All signals persisted in `signals` table with full skip reasons for diagnostics
- Secrets in `~/.polymarket-secrets`, never in the repository
- Use a dedicated hot wallet with limited USDC balance — not your primary wallet

---

## TODO

### Backlog — Next Up

- [ ] **Backtesting** — replay the last 6 months of whale positions against resolved markets. Simulate: if we had copied every signal from our 72 profitable wallets, what would the P&L be? Requires pulling historical trades + resolved outcomes from Gamma and running the signal pipeline offline.

- [ ] **Position age filter** — skip whale positions entered more than X days ago (e.g. 7 days). Currently we can copy a position the whale entered weeks ago when it appears "new" to us (e.g. after a wallet re-scores). Configurable via `MAX_POSITION_AGE_DAYS`.

- [ ] **Multi-outcome market support** — categorical markets (>2 outcomes) are partially supported but the edge calculation and Kelly sizing assume binary Yes/No. Needs outcome-aware pricing from the CLOB.

- [ ] **Wallet quality decay** — wallets that haven't traded in 30+ days should have their `isProfitable` flag re-evaluated. Sharp streaks decay; stale signals shouldn't be trusted.

- [ ] **Signal confidence score** — composite score combining p-value, ROI, resolvedTrades, and edge magnitude. Use as a multiplier on Kelly size instead of a hard cutoff threshold.

- [ ] **Web dashboard** — minimal read-only UI: live signals, open positions with unrealised P&L, whale leaderboard. Next.js or plain HTML served from the same process.

- [ ] **Live trading validation** — before switching `DRY_RUN=false`: verify order placement end-to-end on a small position ($5–10), confirm open_positions tracking, confirm P&L resolution, confirm Telegram alert fires with order ID.