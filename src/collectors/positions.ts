import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { DataApiClient } from '../api/data.js';
import type { DbClient } from '../db/index.js';
import { positions, walletStats } from '../db/schema.js';

// Collects positions for all wallets already tracked in wallet_stats.
// On first run (empty wallet_stats) this is a no-op — wallets get populated from trades.
// Designed to run every hour — full refresh per wallet (DELETE + batch INSERT).
// Uses Data API (data-api.polymarket.com) — Gamma API no longer serves /positions.

// better-sqlite3 executes synchronously on the main thread even behind async/await —
// resolved promises only yield to the microtask queue, not the macrotask queue where
// node-cron timers live. setImmediate explicitly yields to the macrotask queue.
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const CHUNK = 200;

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
      await yieldToEventLoop();
      continue;
    }

    // Full refresh: delete stale snapshot, then insert the current state from the API.
    // The API always returns the complete current position set for the wallet.
    await db.delete(positions).where(eq(positions.walletAddress, walletAddress));

    const rows = raw
      .filter((pos) => pos.asset && pos.conditionId)
      .map((pos) => ({
        walletAddress,
        tokenId: pos.asset,
        market: pos.conditionId,
        outcome: pos.outcome,
        size: pos.size,
        avgPrice: pos.avgPrice,
        unrealizedPnl: pos.curPrice * pos.size - pos.initialValue,
        updatedAt: now,
      }));

    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(positions).values(rows.slice(i, i + CHUNK));
      await yieldToEventLoop();
    }

    totalUpserted += rows.length;
    await yieldToEventLoop();
  }

  childLog.info({ totalUpserted }, 'Position collection complete');
}
