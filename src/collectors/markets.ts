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
    const endDateIso = market.endDateIso ?? market.endDate?.split('T')[0] ?? '';
    return {
      conditionId: market.conditionId,
      questionId,
      question: market.question,
      description: market.description ?? '',
      slug: market.slug,
      status,
      endDateIso,
      volumeNum: market.volumeNum,
      liquidityNum: market.liquidityNum,
      makerBaseFee: 0,
      takerBaseFee: 0,
      active: market.active,
      closed: market.closed,
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
