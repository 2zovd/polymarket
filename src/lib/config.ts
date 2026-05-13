import { homedir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import type { AppConfig } from '../types.js';

// Secrets loaded first from ~/.polymarket-secrets (outside project, not readable by LLM tools).
// Project .env overrides only for non-sensitive config (URLs, flags).
// Order matters: first file wins for duplicate keys.
dotenv.config({ path: join(homedir(), '.polymarket-secrets') });
dotenv.config();

const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a 0x-prefixed 20-byte address');

const privateKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a 0x-prefixed 32-byte hex private key');

const EnvSchema = z.object({
  CLOB_API_URL: z.string().url().default('https://clob.polymarket.com'),
  GAMMA_API_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  DATA_API_URL: z.string().url().default('https://data-api.polymarket.com'),
  SUBGRAPH_URL: z
    .string()
    .url()
    .default('https://api.thegraph.com/subgraphs/name/polymarket/polymarket-matic'),
  DATABASE_PATH: z.string().default('data/polymarket.db'),
  PRIVATE_KEY: privateKeySchema,
  CHAIN_ID: z.coerce.number().int().positive().default(137),
  POLYMARKET_PROXY_ADDRESS: hexAddress.optional(),
  // L2 API credentials — optional until derive-keys is run
  CLOB_API_KEY: z.string().optional(),
  CLOB_SECRET: z.string().optional(),
  CLOB_PASSPHRASE: z.string().optional(),
  DRY_RUN: z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .default('true'),
  MAX_ORDER_SIZE_USDC: z.coerce.number().positive().default(100),
  // ─── Copy Trading ────────────────────────────────────────────────────────────
  MONITOR_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
  PORTFOLIO_SIZE: z.coerce.number().positive().default(1000),
  KELLY_CAP: z.coerce.number().positive().max(1).default(0.25),
  MIN_WHALE_ROI: z.coerce.number().default(0.05),
  MIN_WHALE_TRADES: z.coerce.number().int().positive().default(30),
  MIN_WHALE_PVALUE: z.coerce.number().positive().max(1).default(0.05),
  // Hard cap: never enter if current ask exceeds this. Prevents copying already-priced-in moves.
  MAX_COPY_ASK: z.coerce.number().positive().max(1).default(0.85),
  MIN_POSITION_USDC: z.coerce.number().positive().default(10),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .default('false'),
  POLYGON_RPC_URL: z.string().url().default('https://polygon-rpc.com'),
  // ─── Telegram Alerts (optional) ──────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  DUNE_API_KEY: z.string().optional(),
  MAX_OPEN_POSITIONS: z.coerce.number().int().positive().default(20),
  // Skip markets closing within this many hours. Set to 0 to allow micro-markets (5-min, 1-hour).
  MIN_MARKET_HOURS_REMAINING: z.coerce.number().nonnegative().default(4),
  // Hard floor applied regardless of hours setting — prevents entries in the final seconds.
  MIN_MARKET_MINUTES_BUFFER: z.coerce.number().nonnegative().default(1),
  STREAM_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  // Skip positions first seen more than N hours ago (already priced in). Set to 0 to disable.
  MAX_POSITION_AGE_HOURS: z.coerce.number().nonnegative().default(8),
  // Minimum average USDC per resolved BUY trade for a whale wallet. 0 = disabled.
  MIN_AVG_POSITION_USDC: z.coerce.number().nonnegative().default(0),
  // Minimum ratio currentAsk/whaleAvgPrice. Skip if market repriced heavily against the whale.
  // e.g. 0.5 = skip if current ask < 50% of whale's entry. 0 = disabled.
  MIN_WHALE_ASK_RATIO: z.coerce.number().nonnegative().max(1).default(0.5),
  // Minimum edge (whaleAvgPrice - currentAsk) required to execute. Prevents entering on
  // near-zero-edge positions where the whale's thesis has already been priced in.
  MIN_EDGE: z.coerce.number().nonnegative().default(0.05),
  // When true, only copy a whale's first entry into a market. Position-growth signals
  // (whale adding to existing position) are ignored — by that point the market has
  // typically already priced in the thesis.
  FIRST_ENTRY_ONLY: z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .default('false'),
  // ─── Profitable Whale Expansion ──────────────────────────────────────────────
  // Also track is_profitable (not just is_sharp) wallets with high enough ROI.
  // Catches strong traders blocked from sharp only by Brier calibration threshold.
  INCLUDE_PROFITABLE_WHALES: z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .default('false'),
  MIN_PROFITABLE_ROI: z.coerce.number().nonnegative().default(0.15),
  MIN_PROFITABLE_TRADES: z.coerce.number().int().positive().default(50),
  MIN_PROFITABLE_AVG_POS: z.coerce.number().nonnegative().default(0),
});

function loadConfig(): AppConfig {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`[config] Environment validation failed:\n${issues}`);
    console.error('[config] Copy .env.example → .env and fill in required values.');
    process.exit(1);
  }

  const env = result.data;

  const hasCreds = env.CLOB_API_KEY && env.CLOB_SECRET && env.CLOB_PASSPHRASE;

  return {
    clobApiUrl: env.CLOB_API_URL,
    gammaApiUrl: env.GAMMA_API_URL,
    dataApiUrl: env.DATA_API_URL,
    subgraphUrl: env.SUBGRAPH_URL,
    databasePath: env.DATABASE_PATH,
    privateKey: env.PRIVATE_KEY as `0x${string}`,
    chainId: env.CHAIN_ID,
    polymarketProxyAddress: env.POLYMARKET_PROXY_ADDRESS
      ? (env.POLYMARKET_PROXY_ADDRESS as `0x${string}`)
      : null,
    clobCreds: hasCreds
      ? {
          key: env.CLOB_API_KEY as string,
          secret: env.CLOB_SECRET as string,
          passphrase: env.CLOB_PASSPHRASE as string,
        }
      : null,
    dryRun: env.DRY_RUN,
    maxOrderSizeUsdc: env.MAX_ORDER_SIZE_USDC,
    monitorIntervalSeconds: env.MONITOR_INTERVAL_SECONDS,
    portfolioSize: env.PORTFOLIO_SIZE,
    kellyCap: env.KELLY_CAP,
    minWhaleRoi: env.MIN_WHALE_ROI,
    minWhaleTrades: env.MIN_WHALE_TRADES,
    minWhalePvalue: env.MIN_WHALE_PVALUE,
    maxCopyAsk: env.MAX_COPY_ASK,
    minPositionUsdc: env.MIN_POSITION_USDC,
    logLevel: env.LOG_LEVEL,
    logPretty: env.LOG_PRETTY,
    polygonRpcUrl: env.POLYGON_RPC_URL,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? null,
    telegramChatId: env.TELEGRAM_CHAT_ID ?? null,
    duneApiKey: env.DUNE_API_KEY ?? null,
    maxOpenPositions: env.MAX_OPEN_POSITIONS,
    minMarketHoursRemaining: env.MIN_MARKET_HOURS_REMAINING,
    minMarketMinutesBuffer: env.MIN_MARKET_MINUTES_BUFFER,
    streamIntervalSeconds: env.STREAM_INTERVAL_SECONDS,
    maxPositionAgeHours: env.MAX_POSITION_AGE_HOURS,
    minAvgPositionUsdc: env.MIN_AVG_POSITION_USDC,
    minWhaleAskRatio: env.MIN_WHALE_ASK_RATIO,
    minEdge: env.MIN_EDGE,
    firstEntryOnly: env.FIRST_ENTRY_ONLY,
    includeProfitableWhales: env.INCLUDE_PROFITABLE_WHALES,
    minProfitableRoi: env.MIN_PROFITABLE_ROI,
    minProfitableTrades: env.MIN_PROFITABLE_TRADES,
    minProfitableAvgPos: env.MIN_PROFITABLE_AVG_POS,
  };
}

// Singleton — loaded once at module import time.
export const config = loadConfig();
