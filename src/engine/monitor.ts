import { and, eq, gt } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { ClobClientWrapper } from '../api/clob.js';
import type { DataApiClient, DataApiPosition } from '../api/data.js';
import type { DbClient } from '../db/index.js';
import { walletStats, watchedPositions } from '../db/schema.js';
import type { AppConfig } from '../types.js';
import { executeSignal } from './executor.js';
import { type WhalePosition, generateSignal } from './signal.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadWhaleWallets(db: DbClient, config: AppConfig) {
  return db
    .select()
    .from(walletStats)
    .where(
      and(
        eq(walletStats.isProfitable, true),
        gt(walletStats.resolvedTrades, config.minWhaleTrades),
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

export async function runMonitorCycle(
  dataApi: DataApiClient,
  clob: ClobClientWrapper,
  db: DbClient,
  log: Logger,
  config: AppConfig,
): Promise<void> {
  const childLog = log.child({ module: 'monitor' });
  const whales = await loadWhaleWallets(db, config);
  childLog.info({ whales: whales.length }, 'Monitor cycle started');

  for (const whale of whales) {
    try {
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
          initialValue: p.initialValue ?? 0,
        }));

      const prevSnapshot = await getPreviousSnapshot(db, whale.walletAddress);

      // Detect new or significantly increased positions
      const newPositions = positions.filter((pos) => {
        const prevSize = prevSnapshot.get(pos.tokenId);
        if (prevSize === undefined) return true; // brand new
        return pos.size > prevSize * 1.2 && pos.size - prevSize > 1; // grew >20% and >1 share
      });

      if (newPositions.length > 0) {
        childLog.info(
          { wallet: whale.walletAddress.slice(0, 10), newPositions: newPositions.length },
          'New positions detected',
        );

        for (const pos of newPositions) {
          const signal = await generateSignal(
            pos,
            {
              pValue: whale.pValue,
              roi: whale.roi,
              resolvedTrades: whale.resolvedTrades,
            },
            clob,
            db,
            config,
          );

          await executeSignal(signal, clob, db, childLog, config);
        }
      }

      await updateSnapshot(db, whale.walletAddress, positions, now);
    } catch (err) {
      log.warn({ wallet: whale.walletAddress.slice(0, 10), err }, 'Monitor: wallet scan failed');
    }
  }

  childLog.info('Monitor cycle complete');
}

export async function startMonitor(
  dataApi: DataApiClient,
  clob: ClobClientWrapper,
  db: DbClient,
  log: Logger,
  config: AppConfig,
): Promise<void> {
  log.info(
    { intervalSeconds: config.monitorIntervalSeconds, dryRun: config.dryRun },
    'Copy trading monitor started',
  );

  while (true) {
    await runMonitorCycle(dataApi, clob, db, log, config);
    await sleep(config.monitorIntervalSeconds * 1000);
  }
}
