import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { GammaClient } from '../api/gamma.js';
import type { DbClient } from '../db/index.js';
import { positions, walletStats } from '../db/schema.js';

// Gamma API position shape (untyped in gamma client — validate defensively here).
interface GammaPosition {
  proxyWallet?: string;
  user?: string;
  asset?: string;
  conditionId?: string;
  outcome?: string;
  size?: number | string;
  avgPrice?: number | string;
  currentValue?: number | string;
  initialValue?: number | string;
}

// Collects positions for all wallets already tracked in wallet_stats.
// On first run (empty wallet_stats) this is a no-op — wallets get populated from trades.
// Designed to run every hour — idempotent (upsert on wallet+token composite).

export async function collectPositions(
  gamma: GammaClient,
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
    let raw: unknown[];
    try {
      raw = await gamma.getWalletPositions(walletAddress);
    } catch (err) {
      childLog.warn({ walletAddress, err }, 'Failed to fetch positions for wallet — skipping');
      continue;
    }

    for (const item of raw) {
      const pos = item as GammaPosition;
      const tokenId = pos.asset ?? '';
      const market = pos.conditionId ?? '';

      if (!tokenId || !market) continue;

      const size = Number(pos.size ?? 0);
      const avgPrice = Number(pos.avgPrice ?? 0);
      const currentValue = Number(pos.currentValue ?? 0);
      const initialValue = Number(pos.initialValue ?? 0);
      const unrealizedPnl = currentValue - initialValue;

      const existing = await db
        .select({ walletAddress: positions.walletAddress })
        .from(positions)
        .where(eq(positions.walletAddress, walletAddress))
        .get();

      const row = {
        walletAddress,
        tokenId,
        market,
        outcome: pos.outcome ?? '',
        size,
        avgPrice,
        unrealizedPnl,
        updatedAt: now,
      };

      if (existing) {
        await db
          .update(positions)
          .set(row)
          .where(eq(positions.walletAddress, walletAddress));
      } else {
        await db.insert(positions).values(row);
      }

      totalUpserted++;
    }
  }

  childLog.info({ totalUpserted }, 'Position collection complete');
}
