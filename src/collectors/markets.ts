import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { GammaClient } from '../api/gamma.js';
import type { DbClient } from '../db/index.js';
import { markets } from '../db/schema.js';

// Fetches active markets from Gamma API and upserts them into the markets table.
// Designed to run every 30 min via cron — safe to re-run (idempotent).

const PAGE_SIZE = 500;

export async function collectMarkets(
  gamma: GammaClient,
  db: DbClient,
  log: Logger,
): Promise<void> {
  const childLog = log.child({ collector: 'markets' });
  childLog.info('Starting market collection');

  let offset = 0;
  let totalUpserted = 0;

  while (true) {
    const page = await gamma.getMarkets({ limit: PAGE_SIZE, offset, active: true });
    if (page.length === 0) break;

    const now = new Date().toISOString();

    for (const market of page) {
      const existing = await db
        .select({ conditionId: markets.conditionId })
        .from(markets)
        .where(eq(markets.conditionId, market.conditionId))
        .get();

      const row = {
        conditionId: market.conditionId,
        questionId: market.questionId,
        question: market.question,
        description: market.description,
        slug: market.slug,
        status: market.status,
        endDateIso: market.endDateIso,
        volumeNum: market.volumeNum,
        liquidityNum: market.liquidityNum,
        makerBaseFee: market.makerBaseFee,
        takerBaseFee: market.takerBaseFee,
        active: market.active,
        closed: market.closed,
        resolvedAt: market.status === 'resolved' ? now : null,
        updatedAt: now,
      };

      if (existing) {
        await db.update(markets).set(row).where(eq(markets.conditionId, market.conditionId));
      } else {
        await db.insert(markets).values(row);
      }

      totalUpserted++;
    }

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  childLog.info({ totalUpserted }, 'Market collection complete');
}
