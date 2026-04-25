import { inArray, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import {
  type ResolvedMarketMap,
  buildResolvedMarketMap,
  scoreWallet,
} from '../analytics/wallet-scorer.js';
import type { DataApiClient } from '../api/data.js';
import type { DbClient } from '../db/index.js';
import { markets, trades, walletStats } from '../db/schema.js';

// Minimum trades in our DB to bother fetching full wallet history.
const MIN_DB_TRADES = 3;
// Delay between per-wallet API calls to avoid hammering the Data API.
const INTER_REQUEST_DELAY_MS = 250;
// Max wallets scored per run — keeps each cron tick bounded.
const MAX_WALLETS_PER_RUN = 200;

async function upsertWalletScore(
  walletAddress: string,
  db: DbClient,
  dataApi: DataApiClient,
  resolvedMap: ResolvedMarketMap,
  now: string,
  log: Logger,
): Promise<{ isProfitable: boolean; isSharp: boolean } | null> {
  try {
    const activity = await dataApi.getWalletActivity(walletAddress);
    await sleep(INTER_REQUEST_DELAY_MS);
    const result = scoreWallet(activity, resolvedMap);

    await db
      .insert(walletStats)
      .values({
        walletAddress,
        totalTrades: result.totalTrades,
        resolvedTrades: result.resolvedTrades,
        winRate: result.winRate,
        roi: result.roi,
        brierScore: result.brierScore,
        pValue: result.pValue,
        isSharp: result.isSharp,
        isProfitable: result.isProfitable,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: walletStats.walletAddress,
        set: {
          totalTrades: walletStats.totalTrades,
          resolvedTrades: walletStats.resolvedTrades,
          winRate: walletStats.winRate,
          roi: walletStats.roi,
          brierScore: walletStats.brierScore,
          pValue: walletStats.pValue,
          isSharp: walletStats.isSharp,
          isProfitable: walletStats.isProfitable,
          updatedAt: walletStats.updatedAt,
        },
      });

    return { isProfitable: result.isProfitable, isSharp: result.isSharp };
  } catch (err) {
    log.warn({ walletAddress, err }, 'Failed to score wallet — skipping');
    return null;
  }
}

/**
 * Score a specific list of wallet addresses from Dune or other external sources.
 * Bypasses the local trades-table filter — useful for seeding from CSV exports.
 */
export async function seedWallets(
  addresses: string[],
  dataApi: DataApiClient,
  db: DbClient,
  log: Logger,
): Promise<void> {
  const childLog = log.child({ collector: 'wallets-seed' });

  const resolvedRows = await db
    .select({ conditionId: markets.conditionId, outcomePrices: markets.outcomePrices })
    .from(markets)
    .where(inArray(markets.status, ['resolved', 'closed']));

  const resolvedMap = buildResolvedMarketMap(resolvedRows);
  childLog.info(
    { resolvedMarkets: Object.keys(resolvedMap).length, addresses: addresses.length },
    'Seed scoring started',
  );

  const now = new Date().toISOString();
  let scored = 0;
  let flagged = 0;

  for (const address of addresses) {
    const r = await upsertWalletScore(address, db, dataApi, resolvedMap, now, childLog);
    if (r) {
      scored++;
      if (r.isProfitable || r.isSharp) flagged++;
    }
  }

  childLog.info({ scored, flagged }, 'Seed scoring complete');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function collectWalletStats(
  dataApi: DataApiClient,
  db: DbClient,
  log: Logger,
): Promise<void> {
  const childLog = log.child({ collector: 'wallets' });

  // Build resolved market lookup from DB — these are the markets where we can score predictions.
  const resolvedRows = await db
    .select({ conditionId: markets.conditionId, outcomePrices: markets.outcomePrices })
    .from(markets)
    // 'closed' = trading closed (outcomePrices populated); 'resolved' = fully settled
    .where(inArray(markets.status, ['resolved', 'closed']));

  const resolvedMap = buildResolvedMarketMap(resolvedRows);
  childLog.info({ resolvedMarkets: Object.keys(resolvedMap).length }, 'Resolved market map built');

  // Get wallets active in our trades table, ordered by volume desc, skip recently scored wallets.
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const walletRows = await db
    .select({
      walletAddress: trades.walletAddress,
      tradeCount: sql<number>`COUNT(*)`,
    })
    .from(trades)
    .groupBy(trades.walletAddress)
    .having(sql`COUNT(*) >= ${MIN_DB_TRADES}`)
    .all();

  // Exclude recently scored wallets to avoid redundant API calls.
  const recentlyScored = new Set(
    (
      await db
        .select({ walletAddress: walletStats.walletAddress })
        .from(walletStats)
        .where(sql`updated_at > ${sixHoursAgo}`)
        .all()
    ).map((r) => r.walletAddress),
  );

  const toScore = walletRows
    .filter((r) => !recentlyScored.has(r.walletAddress))
    .sort((a, b) => b.tradeCount - a.tradeCount)
    .slice(0, MAX_WALLETS_PER_RUN);

  childLog.info(
    { total: walletRows.length, skippedRecent: recentlyScored.size, scoring: toScore.length },
    'Wallet scoring run started',
  );

  let scored = 0;
  let sharp = 0;
  const now = new Date().toISOString();

  for (const { walletAddress } of toScore) {
    const r = await upsertWalletScore(walletAddress, db, dataApi, resolvedMap, now, childLog);
    if (r) {
      scored++;
      if (r.isProfitable || r.isSharp) sharp++;
    }
  }

  childLog.info({ scored, sharp }, 'Wallet scoring complete');
}
