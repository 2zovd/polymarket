import 'dotenv/config';
import { z } from 'zod';
import type { AppConfig } from '../types.js';

// Validates all required env vars at startup. Exits immediately with a clear
// diagnostic if anything is missing or malformed — fail fast before any async paths.

const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a 0x-prefixed 20-byte address');

const privateKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a 0x-prefixed 32-byte hex private key');

const EnvSchema = z.object({
  CLOB_API_URL: z.string().url().default('https://clob.polymarket.com'),
  GAMMA_API_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  SUBGRAPH_URL: z
    .string()
    .url()
    .default('https://api.thegraph.com/subgraphs/name/polymarket/polymarket-matic'),
  PRIVATE_KEY: privateKeySchema,
  CHAIN_ID: z.coerce.number().int().positive().default(137),
  POLYMARKET_PROXY_ADDRESS: hexAddress.optional(),
  DRY_RUN: z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .default('true'),
  MAX_ORDER_SIZE_USDC: z.coerce.number().positive().default(100),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .default('false'),
  POLYGON_RPC_URL: z.string().url().default('https://polygon-rpc.com'),
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

  return {
    clobApiUrl: env.CLOB_API_URL,
    gammaApiUrl: env.GAMMA_API_URL,
    subgraphUrl: env.SUBGRAPH_URL,
    privateKey: env.PRIVATE_KEY as `0x${string}`,
    chainId: env.CHAIN_ID,
    polymarketProxyAddress: env.POLYMARKET_PROXY_ADDRESS
      ? (env.POLYMARKET_PROXY_ADDRESS as `0x${string}`)
      : null,
    dryRun: env.DRY_RUN,
    maxOrderSizeUsdc: env.MAX_ORDER_SIZE_USDC,
    logLevel: env.LOG_LEVEL,
    logPretty: env.LOG_PRETTY,
    polygonRpcUrl: env.POLYGON_RPC_URL,
  };
}

// Singleton — loaded once at module import time.
export const config = loadConfig();
