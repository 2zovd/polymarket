import { and, eq, gt, gte, isNull, or, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { ClobClientWrapper } from '../api/clob.js';
import type { DataApiClient, DataApiPosition } from '../api/data.js';
import type { DbClient } from '../db/index.js';
import { markets, openPositions, walletStats, watchedPositions } from '../db/schema.js';
import type { AppConfig } from '../types.js';
import { executeSignal } from './executor.js';
import { type WhalePosition, generateSignal } from './signal.js';

const WINNER_THRESHOLD = 0.95;

// Module-level cursor for the trade stream — persists across stream cycles within a process.
// Initialised to 2 minutes ago so the first cycle catches any trades missed at startup.
let streamCursor: number = Math.floor(Date.now() / 1000) - 120;

// Cross-cycle duplicate guard: tokenIds reserved or already placed in this process session.
// Shared between stream and monitor cycles to prevent race-condition double-entries when
// both cycles overlap and read openTokenIds from DB before the first order is committed.
const sessionTokenGuard = new Set<string>();

// Cache for getMicroContaminatedWallets — the JOIN over 20k+ rows is expensive to run every 15s.
let microContaminatedCache: Set<string> = new Set();
let microContaminatedCacheTs = 0;
const MICRO_CACHE_TTL_MS = 5 * 60 * 1000;

// Concurrency guards: prevent overlapping cycle executions when a cycle takes longer than
// its interval. Without these, a slow monitor cycle + fast stream tick can run scanWhale
// for the same whale concurrently, defeating the sessionTokenGuard.
let streamCycleRunning = false;
let monitorCycleRunning = false;

/**
 * Returns wallet addresses where >maxRatio of their recent watched positions
 * are "Up or Down" micro-markets. These wallets clog the pipeline with unfilterable
 * noise and have no copyable non-micro activity.
 *
 * Only applies when maxRatio > 0 and the wallet has at least 10 recent positions.
 */
async function getMicroContaminatedWallets(
  db: DbClient,
  maxRatio: number,
  log: Logger,
): Promise<Set<string>> {
  if (maxRatio <= 0) return new Set();

  const now = Date.now();
  if (now - microContaminatedCacheTs < MICRO_CACHE_TTL_MS) {
    return microContaminatedCache;
  }

  const cutoff = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();

  const rows = await db
    .select({
      walletAddress: watchedPositions.walletAddress,
      total: sql<number>`COUNT(*)`,
      microCount: sql<number>`SUM(CASE WHEN ${markets.question} LIKE '%Up or Down%' THEN 1 ELSE 0 END)`,
    })
    .from(watchedPositions)
    .innerJoin(markets, eq(watchedPositions.conditionId, markets.conditionId))
    .where(sql`${watchedPositions.updatedAt} >= ${cutoff}`)
    .groupBy(watchedPositions.walletAddress)
    .having(sql`COUNT(*) >= 10`)
    .all();

  const contaminated = new Set(
    rows
      .filter((r) => r.total > 0 && r.microCount / r.total > maxRatio)
      .map((r) => r.walletAddress),
  );

  if (contaminated.size !== microContaminatedCache.size) {
    log.debug(
      { filtered: contaminated.size, threshold: maxRatio },
      'Micro-market contaminated wallets cache refreshed',
    );
  }

  microContaminatedCache = contaminated;
  microContaminatedCacheTs = now;

  return contaminated;
}

async function loadWhaleWallets(db: DbClient, config: AppConfig, log: Logger) {
  // Sharp tier: statistically significant edge (p<0.01, brier<0.22, roi > minWhaleRoi).
  const sharpConditions = and(
    eq(walletStats.isSharp, true),
    gt(walletStats.resolvedTrades, config.minWhaleTrades),
    gte(walletStats.roi, config.minWhaleRoi),
  );

  const sharpWithAvg =
    config.minAvgPositionUsdc > 0
      ? and(
          sharpConditions,
          or(
            isNull(walletStats.avgPositionSizeUsdc),
            gte(walletStats.avgPositionSizeUsdc, config.minAvgPositionUsdc),
          ),
        )
      : sharpConditions;

  const sharpRows = await db.select().from(walletStats).where(sharpWithAvg).all();

  if (!config.includeProfitableWhales) return sharpRows;

  // Profitable tier: profitable but blocked from sharp (typically by Brier > 0.22).
  // Requires higher ROI and position size to compensate for lower calibration confidence.
  const profitableConditions = and(
    eq(walletStats.isProfitable, true),
    eq(walletStats.isSharp, false),
    gt(walletStats.resolvedTrades, config.minProfitableTrades),
    gte(walletStats.roi, config.minProfitableRoi),
  );

  const profitableWithAvg =
    config.minProfitableAvgPos > 0
      ? and(
          profitableConditions,
          gte(walletStats.avgPositionSizeUsdc, config.minProfitableAvgPos),
        )
      : profitableConditions;

  const profitableRows = await db.select().from(walletStats).where(profitableWithAvg).all();

  // Merge, deduplicate by walletAddress.
  const seen = new Set(sharpRows.map((r) => r.walletAddress));
  let allRows = [...sharpRows, ...profitableRows.filter((r) => !seen.has(r.walletAddress))];

  // Churn filter: high churn + near-zero ROI = market maker, not directional signal.
  if (config.maxChurnRatio > 0) {
    const before = allRows.length;
    allRows = allRows.filter(
      (r) => r.churnRatio == null || r.churnRatio <= config.maxChurnRatio,
    );
    const removed = before - allRows.length;
    if (removed > 0) {
      log.info({ removed, threshold: config.maxChurnRatio }, 'Market-maker wallets excluded by churn filter');
    }
  }

  const contaminated = await getMicroContaminatedWallets(db, config.maxMicroPositionRatio, log);
  if (contaminated.size === 0) return allRows;
  return allRows.filter((r) => !contaminated.has(r.walletAddress));
}

async function getPreviousSnapshot(
  db: DbClient,
  walletAddress: string,
): Promise<Map<string, { size: number; firstSeenAt: string | null }>> {
  const rows = await db
    .select({
      tokenId: watchedPositions.tokenId,
      size: watchedPositions.size,
      firstSeenAt: watchedPositions.firstSeenAt,
    })
    .from(watchedPositions)
    .where(eq(watchedPositions.walletAddress, walletAddress))
    .all();

  return new Map(rows.map((r) => [r.tokenId, { size: r.size, firstSeenAt: r.firstSeenAt }]));
}

async function updateSnapshot(
  db: DbClient,
  walletAddress: string,
  positions: WhalePosition[],
  now: string,
): Promise<void> {
  if (positions.length === 0) return;
  const CHUNK = 100;
  for (let i = 0; i < positions.length; i += CHUNK) {
    const batch = positions.slice(i, i + CHUNK).map((p) => ({
      walletAddress,
      tokenId: p.tokenId,
      conditionId: p.conditionId,
      outcome: p.outcome,
      size: p.size,
      avgPrice: p.avgPrice,
      updatedAt: now,
      firstSeenAt: now,
    }));
    await db
      .insert(watchedPositions)
      .values(batch)
      .onConflictDoUpdate({
        target: [watchedPositions.walletAddress, watchedPositions.tokenId],
        set: {
          size: watchedPositions.size,
          avgPrice: watchedPositions.avgPrice,
          updatedAt: watchedPositions.updatedAt,
          // firstSeenAt intentionally excluded — preserve first detection timestamp
        },
      });
  }
}

/**
 * Resolve open positions whose markets have settled in the markets table.
 * Runs at the start of each cycle — no extra API calls needed.
 */
async function resolveOpenPositions(db: DbClient, log: Logger): Promise<void> {
  const open = await db.select().from(openPositions).where(eq(openPositions.status, 'open')).all();

  if (open.length === 0) return;

  const now = new Date().toISOString();
  let resolved = 0;

  for (const pos of open) {
    const market = await db
      .select({
        closed: markets.closed,
        outcomePrices: markets.outcomePrices,
        outcomes: markets.outcomes,
      })
      .from(markets)
      .where(eq(markets.conditionId, pos.conditionId))
      .get();

    // Gamma reports resolved markets as active:true, closed:true — guard on closed, not active.
    if (!market || !market.closed || !market.outcomePrices) continue;

    let prices: number[];
    try {
      prices = (JSON.parse(market.outcomePrices) as (string | number)[]).map(Number);
    } catch {
      continue;
    }

    let outcomeIndex = -1;
    if (market.outcomes) {
      try {
        const outcomesList = JSON.parse(market.outcomes) as string[];
        outcomeIndex = outcomesList.findIndex((o) => o.toLowerCase() === pos.outcome.toLowerCase());
      } catch {
        continue;
      }
    }

    if (outcomeIndex < 0 || outcomeIndex >= prices.length) continue;

    const price = prices[outcomeIndex];
    if (price === undefined) continue;
    const won = price >= WINNER_THRESHOLD;
    const shares = pos.size / pos.entryPrice;
    const payout = won ? shares : 0;
    const pnl = payout - pos.size;

    await db
      .update(openPositions)
      .set({ status: won ? 'won' : 'lost', payout, pnl, resolvedAt: now })
      .where(eq(openPositions.id, pos.id));

    resolved++;
    log.info(
      { tokenId: pos.tokenId.slice(0, 12), outcome: pos.outcome, won, pnl: pnl.toFixed(2) },
      'Position resolved',
    );
  }

  if (resolved > 0) {
    log.info({ resolved }, 'Position resolution complete');
  }
}

interface ScanStats {
  fresh: number;
  ready: number;
  skipped: Record<string, number>;
}

/**
 * Scan a single whale: fetch current positions, diff against snapshot,
 * generate and execute signals for new or significantly grown positions.
 * Mutates `stats` with per-signal outcomes for cycle-level aggregation.
 */
async function scanWhale(
  whale: {
    walletAddress: string;
    pValue: number | null;
    roi: number | null;
    resolvedTrades: number;
  },
  dataApi: DataApiClient,
  clob: ClobClientWrapper,
  db: DbClient,
  log: Logger,
  config: AppConfig,
  openTokenIds: Set<string>,
  stats: ScanStats,
): Promise<void> {
  const rawPositions: DataApiPosition[] = await dataApi.getWalletPositions(whale.walletAddress);
  const now = new Date().toISOString();

  const positions: WhalePosition[] = rawPositions
    .filter((p) => p.asset && typeof p.avgPrice === 'number')
    .map((p) => ({
      walletAddress: whale.walletAddress,
      tokenId: p.asset,
      conditionId: p.conditionId,
      outcome: p.outcome ?? '',
      size: p.size,
      avgPrice: p.avgPrice,
      initialValue: p.initialValue ?? p.size * p.avgPrice,
    }));

  const prevSnapshot = await getPreviousSnapshot(db, whale.walletAddress);

  const newPositions = positions.filter((pos) => {
    const prev = prevSnapshot.get(pos.tokenId);
    if (prev === undefined) return true;
    if (config.firstEntryOnly) return false;
    return pos.size > prev.size * 1.2 && pos.size - prev.size >= config.minPositionUsdc;
  });

  // Age filter: skip positions first seen longer than maxPositionAgeHours ago.
  // Brand-new positions (not in snapshot) always pass — firstSeenAt not set yet.
  const maxAgeMs = config.maxPositionAgeHours * 3_600_000;
  const staleCount = newPositions.filter((pos) => {
    const prev = prevSnapshot.get(pos.tokenId);
    if (!prev?.firstSeenAt) return false;
    return Date.now() - new Date(prev.firstSeenAt).getTime() > maxAgeMs;
  }).length;
  const freshPositions = newPositions.filter((pos) => {
    const prev = prevSnapshot.get(pos.tokenId);
    if (!prev?.firstSeenAt) return true;
    return Date.now() - new Date(prev.firstSeenAt).getTime() <= maxAgeMs;
  });

  if (staleCount > 0) {
    log.info(
      {
        wallet: whale.walletAddress.slice(0, 10),
        staleCount,
        maxAgeHours: config.maxPositionAgeHours,
      },
      'Stale positions skipped (age filter)',
    );
  }

  if (freshPositions.length > 0) {
    stats.fresh += freshPositions.length;

    log.info(
      { wallet: whale.walletAddress.slice(0, 10), freshPositions: freshPositions.length },
      'New positions detected',
    );

    for (const pos of freshPositions) {
      if (openTokenIds.size >= config.maxOpenPositions) {
        log.info({ max: config.maxOpenPositions }, 'Position cap reached mid-cycle');
        break;
      }

      // Cross-cycle guard: reserve sessionTokenGuard synchronously BEFORE any await to close
      // the TOCTOU window. openTokenIds is intentionally NOT updated yet — generateSignal
      // checks it to detect same-cycle duplicates, so it must not contain the current token.
      if (sessionTokenGuard.has(pos.tokenId)) continue;
      sessionTokenGuard.add(pos.tokenId);

      const signal = await generateSignal(
        pos,
        clob,
        db,
        config,
        openTokenIds,
      );

      if (signal.status !== 'ready') {
        const reason = signal.skipReason ?? 'unknown';
        stats.skipped[reason] = (stats.skipped[reason] ?? 0) + 1;
        log.info(
          {
            wallet: whale.walletAddress.slice(0, 10),
            tokenId: pos.tokenId.slice(0, 12),
            reason,
            whaleAvgPrice: pos.avgPrice,
          },
          'Signal skipped',
        );
        // Signal filtered out — release session guard so future cycles can re-evaluate.
        sessionTokenGuard.delete(pos.tokenId);
        continue;
      }

      stats.ready += 1;

      // Signal passed all quality gates — now reserve in openTokenIds so subsequent
      // whales in this cycle don't double-enter the same token.
      openTokenIds.add(pos.tokenId);

      const execResult = await executeSignal(signal, clob, db, log, config);

      if (execResult.status !== 'executed' && execResult.status !== 'dry-run') {
        // Order failed — release both guards so future cycles can retry.
        sessionTokenGuard.delete(pos.tokenId);
        openTokenIds.delete(pos.tokenId);
      }
    }
  }

  await updateSnapshot(db, whale.walletAddress, positions, now);
}

export async function runMonitorCycle(
  dataApi: DataApiClient,
  clob: ClobClientWrapper,
  db: DbClient,
  log: Logger,
  config: AppConfig,
): Promise<void> {
  const childLog = log.child({ module: 'monitor' });

  await resolveOpenPositions(db, childLog);

  const openRows = await db
    .select({ tokenId: openPositions.tokenId })
    .from(openPositions)
    .where(eq(openPositions.status, 'open'))
    .all();

  const openTokenIds = new Set(openRows.map((r) => r.tokenId));

  if (openTokenIds.size >= config.maxOpenPositions) {
    childLog.info(
      { open: openTokenIds.size, max: config.maxOpenPositions },
      'Max open positions reached — skipping new entries',
    );
    return;
  }

  const whales = await loadWhaleWallets(db, config, childLog);
  childLog.info(
    { whales: whales.length, openPositions: openTokenIds.size },
    'Monitor cycle started',
  );

  const stats: ScanStats = { fresh: 0, ready: 0, skipped: {} };

  for (const whale of whales) {
    try {
      await scanWhale(whale, dataApi, clob, db, childLog, config, openTokenIds, stats);
    } catch (err) {
      log.warn({ wallet: whale.walletAddress.slice(0, 10), err }, 'Monitor: wallet scan failed');
    }
  }

  childLog.info({ whales: whales.length, ...stats }, 'Monitor cycle complete');
}

/**
 * Fast detection layer: polls the global trade stream every ~15 seconds.
 *
 * Two complementary detection paths:
 *
 * PATH A — Trade-based (new, faster):
 *   Reacts directly to whale BUY trades in the stream. Skips the position-fetch
 *   entirely, cutting latency from ~30s to ~5s. The trade price replaces whaleAvgPrice
 *   as the probability proxy. Catches short-lived markets (5–15 min) before ask moves.
 *
 * PATH B — Position-based (existing, fallback):
 *   For active whale wallets not yet handled by PATH A, fetches the full position
 *   snapshot and diffs against watchedPositions. Catches position growth and markets
 *   where the whale's trade didn't appear in this stream window.
 */
export async function runStreamCycle(
  dataApi: DataApiClient,
  clob: ClobClientWrapper,
  db: DbClient,
  log: Logger,
  config: AppConfig,
): Promise<void> {
  const childLog = log.child({ module: 'stream' });

  const whales = await loadWhaleWallets(db, config, childLog);
  if (whales.length === 0) return;

  const whaleMap = new Map(whales.map((w) => [w.walletAddress, w]));

  let trades: Awaited<ReturnType<typeof dataApi.getRecentTrades>>;
  try {
    trades = await dataApi.getRecentTrades(streamCursor);
  } catch (err) {
    childLog.warn({ err }, 'Stream: trade fetch failed — skipping cycle');
    return;
  }

  if (trades.length === 0) return;

  // Advance cursor so next call only fetches newer trades.
  streamCursor = Math.max(...trades.map((t) => t.timestamp));

  const whaleTrades = trades.filter((t) => whaleMap.has(t.proxyWallet));
  if (whaleTrades.length === 0) return;

  childLog.info(
    { active: new Set(whaleTrades.map((t) => t.proxyWallet)).size, tradesScanned: trades.length },
    'Whales detected in trade stream',
  );

  const openRows = await db
    .select({ tokenId: openPositions.tokenId })
    .from(openPositions)
    .where(eq(openPositions.status, 'open'))
    .all();

  const openTokenIds = new Set(openRows.map((r) => r.tokenId));

  if (openTokenIds.size >= config.maxOpenPositions) {
    childLog.info({ max: config.maxOpenPositions }, 'Max open positions reached — skipping stream');
    return;
  }

  const stats: ScanStats = { fresh: 0, ready: 0, skipped: {} };

  // ── PATH A: Trade-based direct signals ──────────────────────────────────────
  // For each whale BUY trade in this stream window, attempt a signal immediately.
  // Use the trade's own price as whaleAvgPrice so edge reflects the CURRENT opportunity,
  // not an outdated position average.
  // Deduplicate by tokenId — take the most recent BUY trade per token.
  const buyTradeByToken = new Map<string, (typeof whaleTrades)[0]>();
  for (const t of whaleTrades) {
    if (t.side !== 'BUY') continue;
    const existing = buyTradeByToken.get(t.asset);
    if (!existing || t.timestamp > existing.timestamp) {
      buyTradeByToken.set(t.asset, t);
    }
  }

  const tradeSources = new Set<string>(); // tokenIds handled via PATH A

  for (const [tokenId, trade] of buyTradeByToken) {
    if (openTokenIds.size >= config.maxOpenPositions) break;
    if (sessionTokenGuard.has(tokenId)) continue;

    sessionTokenGuard.add(tokenId);
    tradeSources.add(tokenId);
    stats.fresh += 1;

    const usdcSize = trade.size * trade.price;
    const position: WhalePosition = {
      walletAddress: trade.proxyWallet,
      tokenId: trade.asset,
      conditionId: trade.conditionId,
      outcome: trade.outcome ?? '',
      size: trade.size,
      avgPrice: trade.price,
      initialValue: usdcSize,
    };

    const signal = await generateSignal(position, clob, db, config, openTokenIds);

    if (signal.status !== 'ready') {
      const reason = signal.skipReason ?? 'unknown';
      stats.skipped[reason] = (stats.skipped[reason] ?? 0) + 1;
      childLog.info(
        { wallet: trade.proxyWallet.slice(0, 10), tokenId: tokenId.slice(0, 12), reason, tradePrice: trade.price },
        'Trade signal skipped',
      );
      sessionTokenGuard.delete(tokenId);
      continue;
    }

    stats.ready += 1;
    openTokenIds.add(tokenId);

    const execResult = await executeSignal(signal, clob, db, childLog, config);
    if (execResult.status !== 'executed' && execResult.status !== 'dry-run') {
      sessionTokenGuard.delete(tokenId);
      openTokenIds.delete(tokenId);
    }
  }

  // ── PATH B: Position-based fallback for active wallets ─────────────────────
  // For wallets that traded recently but whose BUY trades were already handled
  // (or were SELL trades), run the position-diff scan to catch any positions
  // not visible in the current stream window.
  const activeAddresses = new Set(whaleTrades.map((t) => t.proxyWallet));

  for (const address of activeAddresses) {
    const whale = whaleMap.get(address);
    if (!whale) continue;
    try {
      await scanWhale(whale, dataApi, clob, db, childLog, config, openTokenIds, stats);
    } catch (err) {
      childLog.warn({ wallet: address.slice(0, 10), err }, 'Stream: wallet scan failed');
    }
  }

  childLog.info(
    { active: activeAddresses.size, tradePath: tradeSources.size, ...stats },
    'Stream cycle complete',
  );
}

export async function startMonitor(
  dataApi: DataApiClient,
  clob: ClobClientWrapper,
  db: DbClient,
  log: Logger,
  config: AppConfig,
): Promise<void> {
  log.info(
    {
      fullIntervalSeconds: config.monitorIntervalSeconds,
      streamIntervalSeconds: config.streamIntervalSeconds,
      dryRun: config.dryRun,
    },
    'Copy trading monitor started',
  );

  // Seed cross-cycle guard from existing open positions so restarts don't re-enter.
  const existingOpen = await db
    .select({ tokenId: openPositions.tokenId })
    .from(openPositions)
    .where(eq(openPositions.status, 'open'))
    .all();
  for (const row of existingOpen) sessionTokenGuard.add(row.tokenId);

  // Run both cycles immediately at startup.
  await runStreamCycle(dataApi, clob, db, log, config);
  await runMonitorCycle(dataApi, clob, db, log, config);

  // Stream loop: lightweight, runs frequently.
  const streamMs = config.streamIntervalSeconds * 1000;
  const streamTimer = setInterval(() => {
    if (streamCycleRunning) {
      log.debug('Stream cycle still running — skipping tick');
      return;
    }
    streamCycleRunning = true;
    runStreamCycle(dataApi, clob, db, log, config)
      .catch((err) => log.error({ err }, 'Stream cycle unhandled error'))
      .finally(() => {
        streamCycleRunning = false;
      });
  }, streamMs);

  // Full snapshot loop: heavier, runs every monitorIntervalSeconds.
  const fullMs = config.monitorIntervalSeconds * 1000;
  const fullTimer = setInterval(() => {
    if (monitorCycleRunning) {
      log.debug('Monitor cycle still running — skipping tick');
      return;
    }
    monitorCycleRunning = true;
    runMonitorCycle(dataApi, clob, db, log, config)
      .catch((err) => log.error({ err }, 'Monitor cycle unhandled error'))
      .finally(() => {
        monitorCycleRunning = false;
      });
  }, fullMs);

  // Graceful shutdown — let PM2 / process signals clean up timers.
  const shutdown = () => {
    clearInterval(streamTimer);
    clearInterval(fullTimer);
    log.info('Monitor stopped');
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Keep the process alive (setInterval alone doesn't prevent exit).
  await new Promise<never>(() => {});
}
