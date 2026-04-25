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
  MIN_EDGE_PCT: z.coerce.number().default(0.01),
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
    minEdgePct: env.MIN_EDGE_PCT,
    minPositionUsdc: env.MIN_POSITION_USDC,
    logLevel: env.LOG_LEVEL,
    logPretty: env.LOG_PRETTY,
    polygonRpcUrl: env.POLYGON_RPC_URL,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? null,
    telegramChatId: env.TELEGRAM_CHAT_ID ?? null,
    duneApiKey: env.DUNE_API_KEY ?? null,
  };
}

// Singleton — loaded once at module import time.
export const config = loadConfig();
