import { inArray, lt, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { DbClient } from './index.js';
import { markets, signals, trades, watchedPositions } from './schema.js';

const SIGNALS_RETENTION_DAYS = 14;
const TRADES_RETENTION_DAYS = 90;
const MARKETS_RETENTION_DAYS = 180;
// Micro-markets (Up or Down) close every 5 minutes and never contribute to scoring.
// Aggressively purge them after 7 days to keep the markets table lean.
const MICRO_MARKETS_RETENTION_DAYS = 7;

export async function vacuumDb(db: DbClient, log: Logger): Promise<void> {
  const childLog = log.child({ task: 'db-vacuum' });

  const signalsCutoff = new Date(
    Date.now() - SIGNALS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const tradesCutoff = new Date(
    Date.now() - TRADES_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const marketsCutoff = new Date(
    Date.now() - MARKETS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const microMarketsCutoff = new Date(
    Date.now() - MICRO_MARKETS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Skipped signals: pure noise after a few days, not referenced by open_positions
  const { changes: skippedSignals } = db
    .delete(signals)
    .where(sql`status = 'skipped' AND created_at < ${signalsCutoff}`)
    .run();

  // Raw trade rows: wallet scoring fetches fresh from API; local copy only used to
  // identify which wallets to score. Keep 90 days as a rolling window.
  const { changes: oldTrades } = db.delete(trades).where(lt(trades.createdAt, tradesCutoff)).run();

  // Watched position snapshots for closed markets: firstEntryOnly logic
  // will never signal on these again (whale's position is stuck/expired).
  const staleMarkets = await db
    .select({ conditionId: markets.conditionId })
    .from(markets)
    .where(sql`status = 'closed'`)
    .all();

  let stalePosDeleted = 0;
  const CHUNK = 500;
  for (let i = 0; i < staleMarkets.length; i += CHUNK) {
    const ids = staleMarkets.slice(i, i + CHUNK).map((m) => m.conditionId);
    const { changes } = db
      .delete(watchedPositions)
      .where(inArray(watchedPositions.conditionId, ids))
      .run();
    stalePosDeleted += changes;
  }

  // Micro-markets (Up or Down): never used in scoring, safe to delete after 7 days.
  const { changes: oldMicroMarkets } = db
    .delete(markets)
    .where(
      sql`status = 'closed'
          AND question LIKE '%Up or Down%'
          AND updated_at < ${microMarketsCutoff}`,
    )
    .run();

  // Old closed real markets with no remaining trades referencing them.
  // Keep for 180 days: wallet scoring joins against these for historical stats.
  const { changes: oldMarkets } = db
    .delete(markets)
    .where(
      sql`status = 'closed'
          AND question NOT LIKE '%Up or Down%'
          AND updated_at < ${marketsCutoff}
          AND condition_id NOT IN (SELECT DISTINCT market FROM trades)`,
    )
    .run();

  childLog.info(
    {
      skippedSignals,
      oldTrades,
      stalePosDeleted,
      oldMicroMarkets,
      oldMarkets,
    },
    'DB vacuum complete',
  );

  // Reclaim freed pages from disk. Runs after deletes to maximise space recovery.
  db.run(sql`VACUUM`);

  const sizeMb = (
    db.get<{ size_mb: number }>(
      sql`SELECT page_count * page_size / 1024.0 / 1024.0 as size_mb
          FROM pragma_page_count(), pragma_page_size()`,
    ) ?? { size_mb: 0 }
  ).size_mb;

  childLog.info({ sizeMb: sizeMb.toFixed(1) }, 'DB size after vacuum');
}
