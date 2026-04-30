// One-shot: refill markets.event_slug + markets.accepting_orders for the entire DB.
// Run once after deploying the event-slug fix:
//   pnpm tsx scripts/backfill-event-slugs.ts
//
// Strategy: re-run the active + resolved market collectors with extended pagination.
// They idempotently upsert the new fields via onConflictDoUpdate.

import { isNull, sql } from 'drizzle-orm';
import { createGammaClient } from '../src/api/gamma.js';
import { collectMarkets, collectResolvedMarkets } from '../src/collectors/markets.js';
import { createDb } from '../src/db/index.js';
import { markets } from '../src/db/schema.js';
import { config } from '../src/lib/config.js';
import { logger } from '../src/lib/logger.js';

async function main(): Promise<void> {
  const gamma = createGammaClient(config, logger);
  const db = createDb(config.databasePath);

  const before = await db
    .select({
      total: sql<number>`count(*)`,
      missing: sql<number>`sum(case when ${markets.eventSlug} is null then 1 else 0 end)`,
    })
    .from(markets)
    .get();

  logger.info({ before }, 'Backfill starting');

  await collectMarkets(gamma, db, logger);
  // Crank up the page cap so we cover the full resolved history (~40k records).
  await collectResolvedMarkets(gamma, db, logger, 200);

  const stillMissing = await db
    .select({ count: sql<number>`count(*)` })
    .from(markets)
    .where(isNull(markets.eventSlug))
    .get();

  logger.info({ stillMissing: stillMissing?.count ?? 0 }, 'Backfill complete');
}

main().catch((err) => {
  logger.error({ err }, 'Backfill failed');
  process.exit(1);
});
