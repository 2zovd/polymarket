import { desc } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { DataApiClient } from '../api/data.js';
import type { DbClient } from '../db/index.js';
import { trades } from '../db/schema.js';

// Fetches new trades from Data API (public, no auth) since the last stored timestamp.
// Data API returns all market trades globally, newest first — we stop at our cursor.
// Designed to run every 15 min — idempotent via onConflictDoNothing on transactionHash.

// 6 hours back on first run — Data API is capped at offset 3000 (≈3000 most recent trades).
// Running every 15 min keeps the window fresh and well within the cap.
const DEFAULT_LOOKBACK_SECONDS = 6 * 60 * 60;

export async function collectTrades(
  dataApi: DataApiClient,
  db: DbClient,
  log: Logger,
): Promise<void> {
  const childLog = log.child({ collector: 'trades' });

  const latest = await db
    .select({ matchTime: trades.matchTime })
    .from(trades)
    .orderBy(desc(trades.matchTime))
    .limit(1)
    .get();

  const sinceTimestamp = latest
    ? Math.floor(new Date(latest.matchTime).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - DEFAULT_LOOKBACK_SECONDS;

  const records = await dataApi.getRecentTrades(sinceTimestamp);

  if (records.length === 0) {
    childLog.info('No new trades');
    return;
  }

  const now = new Date().toISOString();

  const rows = records.map((t) => ({
    id: t.transactionHash,
    market: t.conditionId,
    assetId: t.asset,
    walletAddress: t.proxyWallet,
    side: t.side,
    price: t.price,
    size: t.size,
    feeRateBps: 0,
    outcome: t.outcome,
    status: 'MATCHED',
    matchTime: new Date(t.timestamp * 1000).toISOString(),
    transactionHash: t.transactionHash,
    createdAt: now,
  }));

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(trades)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoNothing({ target: trades.id });
  }

  childLog.info({ inserted: rows.length }, 'Trade collection complete');
}
