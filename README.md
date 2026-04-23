# Polymarket Research & Automation Toolkit

Personal toolkit for Polymarket market analysis, trading automation, whale tracking,
and ML research. Targets the CLOB API, Gamma API, and Polymarket Subgraph.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+, TypeScript strict |
| Package manager | pnpm |
| CLI | commander |
| Validation | Zod |
| Logging | pino (JSON in prod, pino-pretty in dev) |
| Polymarket | @polymarket/clob-client |
| Wallet/Signing | viem |
| Testing | Vitest + msw |
| Linting | Biome |

## Setup

### Prerequisites

```bash
node --version   # must be ≥ 20
pnpm --version   # must be ≥ 9
```

### Install

```bash
pnpm install
```

### Configure

```bash
cp .env.example .env
# Edit .env — at minimum set PRIVATE_KEY and POLYGON_RPC_URL
```

Key variables:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PRIVATE_KEY` | Yes | — | 0x-prefixed 32-byte hex key |
| `POLYGON_RPC_URL` | Yes | public RPC | Alchemy/Infura recommended |
| `DRY_RUN` | No | `true` | Set false only for live orders |
| `MAX_ORDER_SIZE_USDC` | No | `100` | Hard cap per order |
| `CHAIN_ID` | No | `137` | 80002 = Amoy testnet |

## Commands

```bash
# Market data (no auth required)
pnpm dev markets list [--limit 20] [--tag politics] [--closed]
pnpm dev markets get <slug-or-condition-id>
pnpm dev markets traders <conditionId> [--limit 50]
pnpm dev orderbook <tokenId>

# Wallet (no auth required)
pnpm dev wallet positions <address>

# Orders (requires PRIVATE_KEY + L2 API keys)
pnpm dev orders derive-keys        # run once, save output to env
pnpm dev orders list
pnpm dev orders history
```

Output is JSON on stdout — pipe-friendly:

```bash
pnpm dev markets list --limit 5 | jq '.[].question'
```

## Auth flow

Polymarket CLOB uses a two-layer auth system:

1. **L1 (wallet signature)** — proves wallet ownership, used to derive L2 keys
2. **L2 (API key/secret/passphrase)** — used for all order operations

On first use: run `orders derive-keys`, save the output, add `CLOB_API_KEY`,
`CLOB_SECRET`, and `CLOB_PASSPHRASE` to your `.env`. Extend `src/lib/config.ts`
to load these as needed.

## Development

```bash
pnpm typecheck        # strict TypeScript, no emit
pnpm lint             # Biome lint + format check
pnpm lint:fix         # auto-fix
pnpm format           # format only
pnpm test             # Vitest (run once)
pnpm test:watch       # Vitest (interactive)
pnpm test:coverage    # with v8 coverage
pnpm ci               # typecheck + lint + test (run before commit)
```

## Project structure

```
src/
├── index.ts            CLI entry point
├── types.ts            Shared domain types
├── api/
│   ├── clob.ts         CLOB API wrapper (order ops, orderbook)
│   └── gamma.ts        Gamma API client (market metadata, positions)
├── commands/
│   ├── markets.ts      markets list|get|traders
│   ├── orderbook.ts    orderbook <tokenId>
│   ├── orders.ts       orders list|history|derive-keys
│   └── wallet.ts       wallet positions <address>
└── lib/
    ├── config.ts       Zod env validation, AppConfig singleton
    └── logger.ts       pino logger singleton
tests/                  mirrors src/ structure
```

## Safety model

- `DRY_RUN=true` (default) — all order mutations are logged and no-opped
- `MAX_ORDER_SIZE_USDC` — hard cap enforced by the CLOB wrapper
- Both guards are independent; neither can be bypassed by the other
- Use a dedicated hot wallet with limited USDC balance, not your primary wallet

## Architecture decisions

**Biome** — single-binary formatter + linter, zero plugin config overhead.\
**viem** — required by `@polymarket/clob-client` (already in the dep graph).\
**NodeNext + ESM** — native ESM for Node 20+; all relative imports use `.js` extensions.\
**No Python on startup** — Python layer added as `python/` subdirectory when first ML notebook is needed.
