# Polymarket Trading Toolkit

Autonomous whale-tracking and copy-trading bot for Polymarket — built in TypeScript.

- Scores wallets by ROI / win_rate / p-value using Kelly criterion
- Tracks profitable whale positions in real time via Polymarket Data API
- Automatically copies new entries through the CLOB API
- Discovers top traders from Dune Analytics (query 6979866)
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

The toolkit uses a two-file secrets model:

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
# DUNE_API_KEY=...          # enables whales discover
# TELEGRAM_BOT_TOKEN=...    # enables signal alerts
# TELEGRAM_CHAT_ID=...      # your chat/group ID
EOF
```

Then generate L2 API credentials (one-time):

```bash
pnpm dev orders derive-keys
# Copy the output CLOB_API_KEY / CLOB_SECRET / CLOB_PASSPHRASE → ~/.polymarket-secrets
```

---

## Quick Start

```bash
# 1. Start background data collectors (markets every 30 min, trades every 15 min)
pnpm dev cron

# 2. Discover and score profitable whale wallets from Dune Analytics
pnpm dev whales discover               # fetches top-200, scores each via Data API
pnpm dev whales top --profitable       # review results

# 3. Test the copy trading engine (dry-run — no real orders)
pnpm dev copy start --once             # single cycle, inspect signals
pnpm dev copy status                   # review what was detected and why

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
| `copy start [--once]` | Start the monitor loop (add `--once` to test) |
| `copy status [-n N] [--live]` | Recent signals (add `--live` for executed only) |
| `cron` | Start all collectors on schedule |

---

## How Copy Trading Works

```
Dune Analytics ──→ whales discover ──→ wallet_stats (ROI, p-value, Brier score)
                                                │
                         ┌──────────────────────┘
                         ↓  every MONITOR_INTERVAL_SECONDS
               data-api /positions per whale wallet
                         │
                    diff vs snapshot (watched_positions table)
                         │ new position OR size grew >20%
               generateSignal: quality gates
                 · wallet ROI > MIN_WHALE_ROI
                 · p-value < MIN_WHALE_PVALUE
                 · position initialValue > MIN_POSITION_USDC
                 · market is active in our DB
                 · edge = whaleAvgPrice − currentAsk > MIN_EDGE_PCT
                         │
               kellySize = edge / (1 − ask) × KELLY_CAP × PORTFOLIO_SIZE
                         │
               placeLimitOrder → signals table → Telegram alert
```

---

## Copy Trading Parameters

Configure in `.env` (non-sensitive) or `~/.polymarket-secrets`:

| Variable | Default | Description |
|---|---|---|
| `DRY_RUN` | `true` | No real orders sent when true |
| `MAX_ORDER_SIZE_USDC` | `100` | Hard cap per order in USDC |
| `PORTFOLIO_SIZE` | `1000` | Capital base for Kelly sizing |
| `KELLY_CAP` | `0.25` | Fraction of full Kelly bet (25%) |
| `MONITOR_INTERVAL_SECONDS` | `300` | Polling interval in seconds |
| `MIN_WHALE_ROI` | `0.05` | Minimum whale wallet ROI (5%) |
| `MIN_WHALE_PVALUE` | `0.05` | Max p-value for significance (5%) |
| `MIN_WHALE_TRADES` | `30` | Minimum resolved trades |
| `MIN_EDGE_PCT` | `0.01` | Minimum price edge to copy (1%) |
| `MIN_POSITION_USDC` | `10` | Ignore whale positions below this |

---

## PM2 Daemon

```bash
pm2 start ecosystem.config.cjs        # start monitor
pm2 logs polymarket-monitor           # tail logs
pm2 restart polymarket-monitor        # restart (use --update-env after .env changes)
pm2 stop polymarket-monitor           # stop
pm2 save && pm2 startup               # persist across reboots (follow the printed sudo command)
```

---

## Development

```bash
pnpm typecheck        # TypeScript strict check, no emit
pnpm lint             # Biome lint + format check
pnpm lint:fix         # auto-fix lint issues
pnpm format           # format only
pnpm test             # Vitest (run once)
pnpm test:watch       # Vitest interactive
pnpm db:generate      # generate Drizzle migration after schema changes
pnpm db:migrate       # apply pending migrations
pnpm db:studio        # open Drizzle Studio (DB GUI in browser)
pnpm ci               # typecheck + lint + test (run before commit)
```

---

## Project Structure

```
src/
├── index.ts              CLI entry point
├── types.ts              Shared domain types + AppConfig interface
├── api/
│   ├── clob.ts           CLOB API wrapper (orders, orderbook, placeLimitOrder)
│   ├── gamma.ts          Gamma API client (market metadata)
│   ├── data.ts           Data API client (trades, wallet activity, positions)
│   └── dune.ts           Dune Analytics API client
├── commands/
│   ├── markets.ts        markets list|get|traders
│   ├── orderbook.ts      orderbook <tokenId>
│   ├── orders.ts         orders list|history|derive-keys
│   ├── wallet.ts         wallet positions
│   ├── whales.ts         whales scan|discover|top|seed|show
│   ├── copy.ts           copy start|status
│   └── cron.ts           background collectors
├── collectors/
│   ├── markets.ts        resolved market collector (Gamma API)
│   ├── trades.ts         global trade stream collector (Data API)
│   └── wallets.ts        wallet scorer + Dune seeder
├── analytics/
│   └── wallet-scorer.ts  ROI / Brier / t-test p-value scoring
├── engine/
│   ├── monitor.ts        polling loop + snapshot diff
│   ├── signal.ts         quality gates + edge calculation
│   ├── sizer.ts          Kelly criterion sizing
│   └── executor.ts       order placement + DB logging
├── db/
│   ├── index.ts          Drizzle + better-sqlite3 setup
│   ├── schema.ts         all table definitions
│   └── migrations/       auto-generated SQL migrations
└── lib/
    ├── config.ts         Zod env validation, AppConfig singleton
    ├── logger.ts         pino logger singleton
    └── telegram.ts       Telegram alert sender
ecosystem.config.cjs      PM2 process config
```

---

## Safety Model

- `DRY_RUN=true` by default — no orders are placed, all signals are logged as `dry-run`
- `MAX_ORDER_SIZE_USDC` — hard cap enforced before every `placeLimitOrder` call
- All signals (executed, skipped, dry-run, error) are persisted in the `signals` table
- Secrets live in `~/.polymarket-secrets`, never in the repository
- Use a dedicated hot wallet with a limited USDC balance — not your primary wallet

---

## TODO

### High Priority
- [ ] **Position tracking / P&L** — `open_positions` table tracking what we bought, at what price, and P&L when markets resolve
- [ ] **Risk controls** — max concurrent open positions, max exposure per market, daily loss limit, dedup check (already hold this tokenId?)
- [ ] **Signal quality tuning** — most signals currently filtered at `wallet_roi_low`. Consider lowering `MIN_WHALE_ROI` to 2% or using a dynamic threshold based on p-value alone

### Medium Priority
- [ ] **Wallet score refresh** — force weekly re-score of all tracked wallets (currently skips wallets scored in the last 6 hours but never forces a refresh of stale data)
- [ ] **Backtesting** — replay historical positions from the 50 profitable wallets against resolved markets to validate strategy P&L
- [ ] **Scheduled Dune discovery** — add `whales discover` to the cron schedule (weekly)

### Low Priority
- [ ] **Position age filter** — skip whale positions older than X days to avoid copying long-dated holds entered weeks ago
- [ ] **Multi-outcome market support** — correct handling of categorical markets with more than 2 outcomes
- [ ] **Web dashboard** — minimal UI for `copy status` instead of CLI