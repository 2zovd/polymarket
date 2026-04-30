import { sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { GammaClient } from '../api/gamma.js';
import type { DbClient } from '../db/index.js';
import { markets } from '../db/schema.js';
import type { MarketStatus } from '../types.js';

// Fetches active markets from Gamma API and bulk-upserts them into the markets table.
// Designed to run every 30 min — idempotent via onConflictDoUpdate.

const PAGE_SIZE = 500;

function deriveStatus(active: boolean, closed: boolean): MarketStatus {
  if (closed) return 'closed';
  if (active) return 'active';
  return 'resolved';
}

async function upsertMarketPage(
  db: DbClient,
  page: import('../types.js').Market[],
  now: string,
): Promise<number> {
  const rows = page.map((market) => {
    const questionId = market.questionID ?? market.questionId ?? '';
    const status = deriveStatus(market.active, market.closed);
    // Prefer the full ISO datetime from endDate so that short-lived markets (5-min, 1-hour)
    // get their precise close time stored. Fall back to the date-only endDateIso when no time
    // component is present, which the expiry check in signal.ts normalises to T23:59:59Z.
    const endDateIso =
      (market.endDate?.includes('T') ? market.endDate : null) ??
      market.endDateIso ??
      (market.endDate ? market.endDate.split('T')[0] : '') ??
      '';
    // events[0].slug is the URL-shaped parent event slug. Fall back to market.slug only
    // for legacy markets that predate the event grouping (rare but exists in the DB).
    const eventSlug = market.events?.[0]?.slug ?? market.slug;
    // Default true: a missing field means the API didn't surface the flag. Only treat as
    // false when the API explicitly says so — otherwise we'd block trades on every market
    // where the field was omitted.
    const acceptingOrders = market.acceptingOrders ?? true;
    return {
      conditionId: market.conditionId,
      questionId,
      question: market.question,
      description: market.description ?? '',
      slug: market.slug,
      eventSlug,
      status,
      endDateIso,
      volumeNum: market.volumeNum,
      liquidityNum: market.liquidityNum,
      makerBaseFee: 0,
      takerBaseFee: 0,
      active: market.active,
      closed: market.closed,
      acceptingOrders,
      resolvedAt: status === 'resolved' ? now : null,
      outcomePrices: market.outcomePrices ?? null,
      outcomes: market.outcomes ?? null,
      updatedAt: now,
    };
  });

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(markets)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: markets.conditionId,
        set: {
          question: markets.question,
          // event_slug and accepting_orders require sql`excluded.*` because Drizzle's
          // SQLite insert builder does not translate column references to excluded.* in
          // onConflictDoUpdate.set — it keeps them as self-references instead.
          eventSlug: sql`excluded.event_slug`,
          acceptingOrders: sql`excluded.accepting_orders`,
          status: markets.status,
          endDateIso: markets.endDateIso,
          volumeNum: markets.volumeNum,
          liquidityNum: markets.liquidityNum,
          active: markets.active,
          closed: markets.closed,
          outcomePrices: markets.outcomePrices,
          outcomes: markets.outcomes,
          updatedAt: markets.updatedAt,
        },
      });
  }
  return rows.length;
}

export async function collectMarkets(gamma: GammaClient, db: DbClient, log: Logger): Promise<void> {
  const childLog = log.child({ collector: 'markets' });
  childLog.info('Starting market collection');

  let offset = 0;
  let totalUpserted = 0;

  while (true) {
    const page = await gamma.getMarkets({ limit: PAGE_SIZE, offset, active: true });
    if (page.length === 0) break;
    totalUpserted += await upsertMarketPage(db, page, new Date().toISOString());
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  childLog.info({ totalUpserted }, 'Market collection complete');
}

// Fetches recently closed markets (newest-first) to populate outcomePrices for wallet scoring.
// Fetches up to maxPages pages so wallet history spanning months gets coverage.
export async function collectResolvedMarkets(
  gamma: GammaClient,
  db: DbClient,
  log: Logger,
  maxPages = 80,
): Promise<void> {
  const childLog = log.child({ collector: 'resolved-markets' });
  let offset = 0;
  let totalCount = 0;

  for (let page = 0; page < maxPages; page++) {
    const results = await gamma.getMarkets({
      limit: PAGE_SIZE,
      closed: true,
      order: 'closedTime',
      ascending: false,
      offset,
    });
    if (results.length === 0) break;
    totalCount += await upsertMarketPage(db, results, new Date().toISOString());
    if (results.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  childLog.info({ count: totalCount }, 'Resolved market collection complete');
}
