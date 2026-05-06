import { eq, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { GammaClient } from '../api/gamma.js';
import type { DbClient } from '../db/index.js';
import { markets, openPositions } from '../db/schema.js';
import type { MarketStatus } from '../types.js';

// Fetches active markets from Gamma API and bulk-upserts them into the markets table.
// Designed to run every 30 min — idempotent via onConflictDoUpdate.

const PAGE_SIZE = 500;

// better-sqlite3 executes synchronously on the main thread even behind async/await.
// setTimeout(0) yields to the timers phase of the next event loop tick, giving other
// scheduled callbacks (setTimeout-based schedulers, etc.) a chance to run between chunks.
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function deriveStatus(active: boolean, closed: boolean): MarketStatus {
  if (closed) return 'closed';
  if (active) return 'active';
  return 'resolved';
}

export async function upsertMarketPage(
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
        // Drizzle's SQLite onConflictDoUpdate.set treats bare column references as
        // self-references (SET col = col), not excluded.col. All mutable fields must
        // use sql`excluded.*` to actually pick up the incoming row's values.
        set: {
          question: sql`excluded.question`,
          eventSlug: sql`excluded.event_slug`,
          acceptingOrders: sql`excluded.accepting_orders`,
          status: sql`excluded.status`,
          endDateIso: sql`excluded.end_date_iso`,
          volumeNum: sql`excluded.volume_num`,
          liquidityNum: sql`excluded.liquidity_num`,
          active: sql`excluded.active`,
          closed: sql`excluded.closed`,
          outcomePrices: sql`excluded.outcome_prices`,
          outcomes: sql`excluded.outcomes`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
    await yieldToEventLoop();
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
    await yieldToEventLoop();
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  childLog.info({ totalUpserted }, 'Market collection complete');
}

/**
 * Force-refreshes Gamma market state for every currently open position.
 * Runs after the main market collector so that markets which transitioned from
 * active→closed/resolved (and therefore dropped out of the active-only feed) get
 * their DB rows updated. Without this, resolveOpenPositions() in monitor.ts would
 * never mark them won/lost because it guards on market.active === false.
 */
export async function refreshOpenPositionMarkets(
  gamma: GammaClient,
  db: DbClient,
  log: Logger,
): Promise<void> {
  const childLog = log.child({ collector: 'open-position-markets' });

  // Join to get slug — Gamma's conditionId query has a fuzzy-match bug that returns
  // unrelated markets. Slug-based lookup is reliable for both active and closed markets.
  const rows = db
    .select({ conditionId: openPositions.conditionId, slug: markets.slug })
    .from(openPositions)
    .leftJoin(markets, eq(openPositions.conditionId, markets.conditionId))
    .where(eq(openPositions.status, 'open'))
    .all();

  if (rows.length === 0) return;

  const marketMap = new Map(rows.map((r) => [r.conditionId, r.slug]));
  childLog.info({ count: marketMap.size }, 'Refreshing markets for open positions');

  const now = new Date().toISOString();
  let refreshed = 0;

  for (const [conditionId, slug] of marketMap) {
    try {
      let results: import('../types.js').Market[] = [];
      if (slug) {
        // Closed markets are only returned when closed=true is explicitly passed.
        results = await gamma.getMarkets({ slug, closed: true });
        if (results.length === 0) {
          results = await gamma.getMarkets({ slug });
        }
      }
      if (results.length === 0) {
        childLog.warn({ conditionId: conditionId.slice(0, 10) }, 'Market not found in Gamma');
        continue;
      }
      await upsertMarketPage(db, results.slice(0, 1), now);
      refreshed++;
    } catch (err) {
      childLog.warn({ conditionId: conditionId.slice(0, 10), err }, 'Market refresh failed');
    }
  }

  childLog.info({ refreshed }, 'Open position market refresh complete');
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
    await yieldToEventLoop();
    if (results.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  childLog.info({ count: totalCount }, 'Resolved market collection complete');
}
