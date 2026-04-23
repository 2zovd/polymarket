import { desc, eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { DbClient } from '../db/index.js';
import { trades } from '../db/schema.js';
import type { SubgraphClient } from '../lib/subgraph.js';

// Fetches new trades from the Subgraph since the last recorded trade timestamp.
// Designed to run every 15 min — idempotent (primary key on trade id).

// Start of Polymarket v2 CLOB era (~Oct 2023); avoids full history scan on first run.
const DEFAULT_SINCE_TIMESTAMP = 1_696_118_400; // 2023-10-01 UTC

export async function collectTrades(
  subgraph: SubgraphClient,
  db: DbClient,
  log: Logger,
): Promise<void> {
  const childLog = log.child({ collector: 'trades' });

  // Find the most recent trade in DB to use as incremental cursor.
  const latest = await db
    .select({ matchTime: trades.matchTime })
    .from(trades)
    .orderBy(desc(trades.matchTime))
    .limit(1)
    .get();

  const sinceTimestamp = latest
    ? Math.floor(new Date(latest.matchTime).getTime() / 1000)
    : DEFAULT_SINCE_TIMESTAMP;

  childLog.info({ since: new Date(sinceTimestamp * 1000).toISOString() }, 'Starting trade collection');

  const records = await subgraph.getTrades(sinceTimestamp);

  if (records.length === 0) {
    childLog.info('No new trades');
    return;
  }

  let inserted = 0;
  let skipped = 0;

  const now = new Date().toISOString();

  for (const record of records) {
    const existing = await db
      .select({ id: trades.id })
      .from(trades)
      .where(eq(trades.id, record.id))
      .get();

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(trades).values({
      id: record.id,
      market: record.market,
      assetId: record.outcomeIndex,
      walletAddress: record.walletAddress,
      side: record.side,
      price: record.price,
      size: record.size,
      feeRateBps: 0,
      outcome: record.outcomeIndex,
      status: 'MATCHED',
      matchTime: new Date(record.timestamp * 1000).toISOString(),
      transactionHash: record.transactionHash,
      createdAt: now,
    });

    inserted++;
  }

  childLog.info({ inserted, skipped }, 'Trade collection complete');
}
