import { and, inArray, notLike, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import {
  type ResolvedMarketMap,
  buildResolvedMarketMap,
  scoreWallet,
} from '../analytics/wallet-scorer.js';
import type { DataApiClient } from '../api/data.js';
import { createDuneClient, extractAddresses } from '../api/dune.js';
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
        avgPositionSizeUsdc: result.avgPositionSizeUsdc,
        churnRatio: result.churnRatio,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: walletStats.walletAddress,
        set: {
          totalTrades: sql`excluded.total_trades`,
          resolvedTrades: sql`excluded.resolved_trades`,
          winRate: sql`excluded.win_rate`,
          roi: sql`excluded.roi`,
          brierScore: sql`excluded.brier_score`,
          pValue: sql`excluded.p_value`,
          isSharp: sql`excluded.is_sharp`,
          isProfitable: sql`excluded.is_profitable`,
          avgPositionSizeUsdc: sql`excluded.avg_position_size_usdc`,
          churnRatio: sql`excluded.churn_ratio`,
          updatedAt: sql`excluded.updated_at`,
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
    .where(
      and(
        inArray(markets.status, ['resolved', 'closed']),
        notLike(markets.question, '%Up or Down%'),
      ),
    );

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

  // Build resolved market lookup from DB — excludes "Up or Down" micro-markets (5-min crypto
  // direction bets) which inflate trade counts but cannot be copied at 15-second granularity.
  const resolvedRows = await db
    .select({ conditionId: markets.conditionId, outcomePrices: markets.outcomePrices })
    .from(markets)
    // 'closed' = trading closed (outcomePrices populated); 'resolved' = fully settled
    .where(
      and(
        inArray(markets.status, ['resolved', 'closed']),
        notLike(markets.question, '%Up or Down%'),
      ),
    );

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

// Re-score all wallets in wallet_stats that haven't been updated in 7+ days.
// This ensures Dune-discovered wallets (absent from the trades table) stay current.
const STALE_WALLET_DAYS = 7;

export async function refreshStaleWallets(
  dataApi: DataApiClient,
  db: DbClient,
  log: Logger,
): Promise<void> {
  const childLog = log.child({ collector: 'wallets-refresh' });

  const cutoff = new Date(Date.now() - STALE_WALLET_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const stale = await db
    .select({ walletAddress: walletStats.walletAddress })
    .from(walletStats)
    .where(sql`updated_at < ${cutoff}`)
    .all();

  if (stale.length === 0) {
    childLog.info('No stale wallets to refresh');
    return;
  }

  childLog.info(
    { count: stale.length, olderThan: `${STALE_WALLET_DAYS}d` },
    'Refreshing stale wallets',
  );

  const resolvedRows = await db
    .select({ conditionId: markets.conditionId, outcomePrices: markets.outcomePrices })
    .from(markets)
    .where(
      and(
        inArray(markets.status, ['resolved', 'closed']),
        notLike(markets.question, '%Up or Down%'),
      ),
    );

  const resolvedMap = buildResolvedMarketMap(resolvedRows);
  const now = new Date().toISOString();
  let scored = 0;
  let flagged = 0;

  for (const { walletAddress } of stale) {
    const r = await upsertWalletScore(walletAddress, db, dataApi, resolvedMap, now, childLog);
    if (r) {
      scored++;
      if (r.isProfitable || r.isSharp) flagged++;
    }
  }

  childLog.info({ scored, flagged }, 'Stale wallet refresh complete');
}

// Default Dune query: top profitable Polymarket wallets ranked by volume.
const DEFAULT_DUNE_QUERY_IDS = [6979866];

// Pull fresh addresses from one or more Dune queries and seed them into wallet_stats.
// Runs weekly — each query covers a different ranking dimension (volume, calibration, recency).
export async function collectDuneWallets(
  duneApiKey: string,
  dataApi: DataApiClient,
  db: DbClient,
  log: Logger,
  queryIds: number[] = DEFAULT_DUNE_QUERY_IDS,
  limit = 500,
): Promise<void> {
  const childLog = log.child({ collector: 'wallets-dune', queryIds });

  const dune = createDuneClient(duneApiKey);
  const allAddresses = new Set<string>();

  for (const queryId of queryIds) {
    childLog.info({ queryId, limit }, 'Fetching Dune query results');
    try {
      const result = await dune.getQueryResults(queryId, limit);
      const addresses = extractAddresses(result.rows);
      if (addresses.length === 0) {
        childLog.warn({ queryId, rowCount: result.rows.length }, 'No addresses in Dune results');
      } else {
        childLog.info({ queryId, addresses: addresses.length }, 'Dune addresses extracted');
        for (const a of addresses) allAddresses.add(a);
      }
    } catch (err) {
      childLog.error({ queryId, err }, 'Dune query failed — skipping');
    }
  }

  if (allAddresses.size === 0) return;

  childLog.info({ total: allAddresses.size }, 'Seeding deduplicated Dune addresses');
  await seedWallets([...allAddresses], dataApi, db, childLog);
}

// Markets to mine per cron run. At 250ms/call this takes ~12s for the mining phase.
const MAX_MARKETS_PER_WINNER_RUN = 50;
// Cap on new addresses to score per run — prevents multi-hour scoring marathons.
// Cron runs every 6h, so across 4 runs/day we process up to 4×300=1200 new addresses/day.
const MAX_NEW_ADDRESSES_PER_WINNER_RUN = 300;

// Mine top traders from high-volume resolved markets and seed them into wallet_stats.
// Uses Data API /trades?market= which returns all participants for a given conditionId.
// Ordered by volume so the most liquid (most traders) markets are always mined first.
// Pre-filters addresses already in wallet_stats to avoid redundant scoring.
export async function collectMarketWinners(
  dataApi: DataApiClient,
  db: DbClient,
  log: Logger,
): Promise<void> {
  const childLog = log.child({ collector: 'market-winners' });

  const resolvedMarkets = await db
    .select({ conditionId: markets.conditionId })
    .from(markets)
    .where(
      and(
        inArray(markets.status, ['resolved', 'closed']),
        notLike(markets.question, '%Up or Down%'),
        sql`outcome_prices IS NOT NULL`,
      ),
    )
    .orderBy(sql`volume_num DESC`)
    .limit(MAX_MARKETS_PER_WINNER_RUN)
    .all();

  if (resolvedMarkets.length === 0) {
    childLog.info('No resolved markets with outcome data to mine');
    return;
  }

  childLog.info({ count: resolvedMarkets.length }, 'Mining traders from resolved markets');

  const allAddresses = new Set<string>();

  for (const { conditionId } of resolvedMarkets) {
    try {
      const marketTrades = await dataApi.getMarketTrades(conditionId, 500);
      await sleep(INTER_REQUEST_DELAY_MS);
      for (const trade of marketTrades) {
        if (trade.side === 'BUY' && trade.proxyWallet) {
          allAddresses.add(trade.proxyWallet.toLowerCase());
        }
      }
    } catch (err) {
      childLog.warn({ conditionId, err }, 'Failed to fetch market trades — skipping');
    }
  }

  if (allAddresses.size === 0) {
    childLog.warn('No addresses extracted from market trades');
    return;
  }

  // Filter out addresses already scored — avoid re-scoring known wallets every run.
  const existingSet = new Set(
    db
      .select({ walletAddress: walletStats.walletAddress })
      .from(walletStats)
      .all()
      .map((r) => r.walletAddress),
  );

  const novel = [...allAddresses]
    .filter((a) => !existingSet.has(a))
    .slice(0, MAX_NEW_ADDRESSES_PER_WINNER_RUN);

  childLog.info(
    { total: allAddresses.size, existing: existingSet.size, novel: novel.length },
    'Market winner addresses extracted — seeding novel addresses',
  );

  if (novel.length === 0) {
    childLog.info('All discovered addresses already scored');
    return;
  }

  await seedWallets(novel, dataApi, db, childLog);
}

// Minimum number of distinct markets a wallet must co-trade with sharps to be considered.
const MIN_CO_OCCURRENCE_MARKETS = 3;

// Find wallets that consistently trade the same markets in the same direction as confirmed sharps.
// These "fellow travellers" share an information source or analytical framework with known winners.
// Effectiveness grows with trades-table depth — weak in week 1, strong after month 1+.
export async function collectCoOccurrenceWallets(
  dataApi: DataApiClient,
  db: DbClient,
  log: Logger,
): Promise<void> {
  const childLog = log.child({ collector: 'wallets-cooccurrence' });

  const candidates = db.all<{ wallet_address: string; co_markets: number }>(sql`
    SELECT t2.wallet_address,
           COUNT(DISTINCT t2.market) AS co_markets,
           COUNT(*)                  AS co_trades
    FROM trades t1
    JOIN trades t2
      ON  t1.market           = t2.market
      AND t2.side             = 'BUY'
      AND t2.match_time BETWEEN datetime(t1.match_time, '-4 hours')
                            AND datetime(t1.match_time, '+4 hours')
      AND t2.wallet_address  != t1.wallet_address
    WHERE t1.wallet_address IN (
            SELECT wallet_address FROM wallet_stats WHERE is_sharp = 1
          )
      AND t1.side        = 'BUY'
      AND t1.match_time  > datetime('now', '-30 days')
    GROUP BY t2.wallet_address
    HAVING COUNT(DISTINCT t2.market) >= ${MIN_CO_OCCURRENCE_MARKETS}
    ORDER BY COUNT(DISTINCT t2.market) DESC
    LIMIT 500
  `);

  if (candidates.length === 0) {
    childLog.info('No co-occurrence candidates found (trades table may be too sparse)');
    return;
  }

  childLog.info({ candidates: candidates.length }, 'Co-occurrence candidates found — seeding');
  await seedWallets(
    candidates.map((r) => r.wallet_address),
    dataApi,
    db,
    childLog,
  );
}
