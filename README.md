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
| Polymarket | @polymarket/clob-client-v2 (V2 API) |
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

**First-time pUSD allowance (required before live trading):**

Polymarket V2 uses **pUSD** (Polymarket USD) as collateral instead of USDC.e. Before switching `DRY_RUN=false`, approve the new V2 exchange contract via the Polymarket UI: **Settings → Trading → Approve**. Without this, order placement will fail with an allowance error.

---

## Quick Start

```bash
# 1. Discover and score profitable whale wallets
pnpm dev whales discover               # fetches top-500 from Dune, scores each
pnpm dev whales top --profitable       # review: should show 40-80 flagged wallets

# 2. Test one monitor cycle (DRY_RUN=true — no real orders)
pnpm dev copy start --once             # single cycle, logs all signals to console
pnpm dev copy status                   # inspect signals and skip reasons in DB

# 3. Run as persistent daemon (see PM2 section below for full command list)
pnpm exec pm2 start ecosystem.config.cjs
pnpm exec pm2 save && pnpm exec pm2 startup
```

---

## Make Commands

Run `make` with no arguments to print the full command list.

### Daemon

| Command | Description |
|---|---|
| `make start` | Start both `polymarket-monitor` and `polymarket-cron` via PM2 |
| `make stop` | Stop all processes |
| `make restart` | Restart all processes and reload `.env` |
| `make status` | PM2 process overview + last 10 signals |
| `make logs` | Tail live logs for the monitor |
| `make logs-cron` | Tail live logs for the cron collectors |

### Inspection

| Command | Description |
|---|---|
| `make once` | Run a single monitor cycle (no daemon, output to console) |
| `make signals` | Last 20 signals with skip reasons |
| `make live` | Only real (non-dry-run) executed orders |
| `make positions` | Currently open copy positions |
| `make history` | All positions including resolved + P&L |
| `make whales` | Profitable whale wallets that pass quality filters |
| `make discover` | Pull top wallets from Dune Analytics and score them |

### DRY_RUN toggle

| Command | Description |
|---|---|
| `make dry-on` | Set `DRY_RUN=true` in `.env` |
| `make dry-off` | Set `DRY_RUN=false` in `.env` |

> After toggling DRY_RUN, always run `make restart` to apply the change.

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
| `DRY_RUN` | `true` | No real orders sent — log as dry-run. **Always verify pUSD allowance before setting to `false`** |
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

> `pm2` is a local dev dependency — use `pnpm exec pm2` everywhere, or install globally once with `pnpm add -g pm2` and then use `pm2` directly.

### Start / Stop

```bash
pnpm exec pm2 start ecosystem.config.cjs   # start both: polymarket-monitor + polymarket-cron
pnpm exec pm2 stop all                     # stop both
pnpm exec pm2 stop polymarket-monitor      # stop only the monitor
pnpm exec pm2 stop polymarket-cron         # stop only the cron collectors
pnpm exec pm2 delete all                   # stop + remove from PM2 process list
```

### Restart (use --update-env after any .env change)

```bash
pnpm exec pm2 restart all --update-env
pnpm exec pm2 restart polymarket-monitor --update-env
pnpm exec pm2 restart polymarket-cron --update-env
```

### Status & Logs

```bash
pnpm exec pm2 status                                  # overview: pid, uptime, restarts, cpu/mem
pnpm exec pm2 logs                                    # tail all logs (both processes)
pnpm exec pm2 logs polymarket-monitor                 # tail monitor only
pnpm exec pm2 logs polymarket-cron                    # tail cron only
pnpm exec pm2 logs polymarket-monitor --lines 100     # last 100 lines
pnpm exec pm2 logs --nostream --lines 50              # print last 50 lines and exit (no tail)
pnpm exec pm2 flush                                   # clear all PM2 log files
```

### Persist across reboots

```bash
pnpm exec pm2 save          # save current process list
pnpm exec pm2 startup       # print the command to register PM2 at boot (run it as sudo)
pnpm exec pm2 unstartup     # remove from startup
```

### Inspect a process

```bash
pnpm exec pm2 describe polymarket-monitor   # full process details, env, restart history
pnpm exec pm2 monit                         # real-time CPU/RAM dashboard (exit with q)
```

**What healthy logs look like:**
```
{"module":"data-api","fetched":12,"msg":"Recent trades fetch complete"}   # every 15–60s
{"module":"monitor","whales":82,"msg":"Monitor cycle started"}            # every 5 min
{"module":"monitor","wallet":"0xabc...","freshPositions":3}               # whale detected
{"module":"executor","dryRun":true,"msg":"DRY_RUN=true — order NOT submitted"}
{"module":"monitor","msg":"Monitor cycle complete"}
```

---

## Operations Reference

### Check current state

```bash
grep DRY_RUN .env                              # is DRY_RUN on or off?
pnpm dev copy status                           # last 20 signals with skip reasons
pnpm dev copy status -n 50                     # last 50 signals
pnpm dev copy status --live                    # only executed (non-dry-run) signals
pnpm dev copy positions                        # currently open copy positions
pnpm dev copy positions --history              # all positions including resolved + P&L
pnpm dev whales top --profitable               # scored whale wallets that pass filters
pnpm dev whales top -n 20                      # top 20 whales by ROI
pnpm dev whales show <address>                 # full stats for one wallet
pnpm dev orders list                           # open orders on CLOB for your wallet
pnpm dev orders history                        # trade history for your wallet
```

### Market inspection

```bash
pnpm dev markets list --limit 10               # latest active markets
pnpm dev markets list --closed --limit 10      # recently closed markets
pnpm dev markets get <slug-or-conditionId>     # single market details
pnpm dev markets traders <conditionId>         # top traders for a market
pnpm dev orderbook <tokenId>                   # live bids/asks for a token
pnpm dev wallet positions <address>            # positions for any wallet address
```

### Whale management

```bash
pnpm dev whales discover                       # pull top wallets from Dune + score all
pnpm dev whales scan                           # re-score wallets already in DB
pnpm dev whales seed wallets.csv               # seed from a CSV/TXT file of addresses
```

### One-off test cycles

```bash
pnpm dev copy start --once                     # single monitor cycle, output to console
pnpm dev cron                                  # run all collectors once then keep on schedule
```

### Switching to live trading

Checklist before setting `DRY_RUN=false`:

1. `make once` — confirm signals look reasonable, no crashes
2. Verify pUSD balance: [polymarket.com](https://polymarket.com) → Portfolio
3. Approve pUSD for V2 exchange: **Settings → Trading → Approve** in the Polymarket UI
4. Verify `MAX_ORDER_SIZE_USDC` in `.env` is set to a small amount (e.g. `5`)
5. `make dry-off` — set `DRY_RUN=false`
6. `make restart` — apply the change
7. `make logs` — watch for the first executed order
8. `make live` — confirm a real signal appears with an `orderId`
9. `pnpm dev orders list` — confirm the order is live on the CLOB

To revert to dry-run at any time:
```bash
make dry-on && make restart
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

## Polymarket V2 API Notes

Polymarket migrated to **CLOB V2** in early 2026. This codebase targets V2 exclusively.

| Area | V2 behavior |
|---|---|
| SDK | `@polymarket/clob-client-v2` (replaces deprecated `@polymarket/clob-client`) |
| Order signing | EIP-712 domain version `"2"`, new exchange contract addresses |
| Order struct | `timestamp` replaces `nonce`; `feeRateBps` and `taker` removed |
| Fees | Determined by protocol at match time; not embedded in the signed order |
| Collateral | **pUSD** (Polymarket USD) on Polygon — replaces USDC.e |
| Positions API | `data-api.polymarket.com/positions` — Gamma API no longer serves `/positions` |
| Tick size | Required at order creation; fetched live via `getTickSize(tokenId)` |
| Proxy wallets | Supported via `SignatureTypeV2.POLY_PROXY` + `funderAddress` in constructor |

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