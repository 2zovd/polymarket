import { and, eq, gt, gte } from 'drizzle-orm';
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

async function loadWhaleWallets(db: DbClient, config: AppConfig) {
  return db
    .select()
    .from(walletStats)
    .where(
      and(
        eq(walletStats.isProfitable, true),
        gt(walletStats.resolvedTrades, config.minWhaleTrades),
        gte(walletStats.roi, config.minWhaleRoi),
      ),
    )
    .all();
}

async function getPreviousSnapshot(
  db: DbClient,
  walletAddress: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ tokenId: watchedPositions.tokenId, size: watchedPositions.size })
    .from(watchedPositions)
    .where(eq(watchedPositions.walletAddress, walletAddress))
    .all();

  return new Map(rows.map((r) => [r.tokenId, r.size]));
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
        active: markets.active,
        outcomePrices: markets.outcomePrices,
        outcomes: markets.outcomes,
      })
      .from(markets)
      .where(eq(markets.conditionId, pos.conditionId))
      .get();

    if (!market || market.active || !market.outcomePrices) continue;

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

/**
 * Scan a single whale: fetch current positions, diff against snapshot,
 * generate and execute signals for new or significantly grown positions.
 * Returns the set of tokenIds that were processed (for openTokenIds sync).
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
    const prevSize = prevSnapshot.get(pos.tokenId);
    if (prevSize === undefined) return true;
    return pos.size > prevSize * 1.2 && pos.size - prevSize > 1;
  });

  if (newPositions.length > 0) {
    log.info(
      { wallet: whale.walletAddress.slice(0, 10), newPositions: newPositions.length },
      'New positions detected',
    );

    for (const pos of newPositions) {
      if (openTokenIds.size >= config.maxOpenPositions) {
        log.info({ max: config.maxOpenPositions }, 'Position cap reached mid-cycle');
        break;
      }

      const signal = await generateSignal(
        pos,
        { pValue: whale.pValue, roi: whale.roi, resolvedTrades: whale.resolvedTrades },
        clob,
        db,
        config,
        openTokenIds,
      );

      const execResult = await executeSignal(signal, clob, db, log, config);

      if (execResult.status === 'executed' || execResult.status === 'dry-run') {
        openTokenIds.add(pos.tokenId);
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

  const whales = await loadWhaleWallets(db, config);
  childLog.info(
    { whales: whales.length, openPositions: openTokenIds.size },
    'Monitor cycle started',
  );

  for (const whale of whales) {
    try {
      await scanWhale(whale, dataApi, clob, db, childLog, config, openTokenIds);
    } catch (err) {
      log.warn({ wallet: whale.walletAddress.slice(0, 10), err }, 'Monitor: wallet scan failed');
    }
  }

  childLog.info('Monitor cycle complete');
}

/**
 * Fast detection layer: polls the global trade stream every ~60 seconds.
 * Identifies which profitable whales traded recently, then immediately
 * scans only those wallets instead of all 72 — reducing latency from
 * 5 minutes to ~60 seconds while cutting API calls by ~80%.
 */
export async function runStreamCycle(
  dataApi: DataApiClient,
  clob: ClobClientWrapper,
  db: DbClient,
  log: Logger,
  config: AppConfig,
): Promise<void> {
  const childLog = log.child({ module: 'stream' });

  const whales = await loadWhaleWallets(db, config);
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

  const activeAddresses = new Set(
    trades.filter((t) => whaleMap.has(t.proxyWallet)).map((t) => t.proxyWallet),
  );

  if (activeAddresses.size === 0) return;

  childLog.info(
    { active: activeAddresses.size, tradesScanned: trades.length },
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

  for (const address of activeAddresses) {
    const whale = whaleMap.get(address);
    if (!whale) continue;
    try {
      await scanWhale(whale, dataApi, clob, db, childLog, config, openTokenIds);
    } catch (err) {
      childLog.warn({ wallet: address.slice(0, 10), err }, 'Stream: wallet scan failed');
    }
  }
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

  // Run both cycles immediately at startup.
  await runStreamCycle(dataApi, clob, db, log, config);
  await runMonitorCycle(dataApi, clob, db, log, config);

  // Stream loop: lightweight, runs frequently.
  const streamMs = config.streamIntervalSeconds * 1000;
  const streamTimer = setInterval(() => {
    runStreamCycle(dataApi, clob, db, log, config).catch((err) =>
      log.error({ err }, 'Stream cycle unhandled error'),
    );
  }, streamMs);

  // Full snapshot loop: heavier, runs every monitorIntervalSeconds.
  const fullMs = config.monitorIntervalSeconds * 1000;
  const fullTimer = setInterval(() => {
    runMonitorCycle(dataApi, clob, db, log, config).catch((err) =>
      log.error({ err }, 'Monitor cycle unhandled error'),
    );
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
