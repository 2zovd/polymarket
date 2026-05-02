import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { DataApiClient } from '../api/data.js';
import type { DbClient } from '../db/index.js';
import { positions, walletStats } from '../db/schema.js';

// Collects positions for all wallets already tracked in wallet_stats.
// On first run (empty wallet_stats) this is a no-op — wallets get populated from trades.
// Designed to run every hour — idempotent (upsert on wallet+token composite).
// Uses Data API (data-api.polymarket.com) — Gamma API no longer serves /positions.

export async function collectPositions(
  dataApi: DataApiClient,
  db: DbClient,
  log: Logger,
): Promise<void> {
  const childLog = log.child({ collector: 'positions' });

  const trackedWallets = await db
    .select({ walletAddress: walletStats.walletAddress })
    .from(walletStats)
    .all();

  if (trackedWallets.length === 0) {
    childLog.info('No tracked wallets yet — skipping position collection');
    return;
  }

  childLog.info({ count: trackedWallets.length }, 'Collecting positions for tracked wallets');

  const now = new Date().toISOString();
  let totalUpserted = 0;

  for (const { walletAddress } of trackedWallets) {
    let raw: Awaited<ReturnType<typeof dataApi.getWalletPositions>>;
    try {
      raw = await dataApi.getWalletPositions(walletAddress);
    } catch (err) {
      childLog.warn({ walletAddress, err }, 'Failed to fetch positions for wallet — skipping');
      continue;
    }

    for (const pos of raw) {
      const tokenId = pos.asset;
      const market = pos.conditionId;

      if (!tokenId || !market) continue;

      const unrealizedPnl = pos.curPrice * pos.size - pos.initialValue;

      const existing = await db
        .select({ walletAddress: positions.walletAddress })
        .from(positions)
        .where(eq(positions.walletAddress, walletAddress))
        .get();

      const row = {
        walletAddress,
        tokenId,
        market,
        outcome: pos.outcome,
        size: pos.size,
        avgPrice: pos.avgPrice,
        unrealizedPnl,
        updatedAt: now,
      };

      if (existing) {
        await db.update(positions).set(row).where(eq(positions.walletAddress, walletAddress));
      } else {
        await db.insert(positions).values(row);
      }

      totalUpserted++;
    }
  }

  childLog.info({ totalUpserted }, 'Position collection complete');
}
