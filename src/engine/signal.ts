import { and, eq, ne } from 'drizzle-orm';
import type { ClobClientWrapper } from '../api/clob.js';
import type { DbClient } from '../db/index.js';
import { markets, watchedPositions } from '../db/schema.js';
import type { AppConfig } from '../types.js';
import { kellySize } from './sizer.js';

export interface WhalePosition {
  walletAddress: string;
  tokenId: string;
  conditionId: string;
  outcome: string;
  size: number;
  avgPrice: number;
  initialValue: number; // USDC value at entry
}

export interface Signal {
  walletAddress: string;
  conditionId: string;
  tokenId: string;
  outcome: string;
  whaleAvgPrice: number;
  currentAsk: number;
  edge: number;
  kellySize: number;
  status: 'ready' | 'skipped';
  skipReason?: string;
  marketQuestion: string;
  /** Parent event slug — used to build polymarket.com/event/<slug> URLs. */
  eventSlug: string;
}

export async function generateSignal(
  position: WhalePosition,
  clob: ClobClientWrapper,
  db: DbClient,
  config: AppConfig,
  openTokenIds: Set<string> = new Set(),
): Promise<Signal> {
  const base = {
    walletAddress: position.walletAddress,
    conditionId: position.conditionId,
    tokenId: position.tokenId,
    outcome: position.outcome,
    whaleAvgPrice: position.avgPrice,
    marketQuestion: '',
    eventSlug: '',
  };

  function skip(reason: string): Signal {
    return { ...base, currentAsk: 0, edge: 0, kellySize: 0, status: 'skipped', skipReason: reason };
  }

  // Risk control — skip if we already hold this token
  if (openTokenIds.has(position.tokenId)) {
    return skip('already_positioned');
  }

  // Skip if the whale is hedged on this market (holds an opposing outcome token for the same
  // conditionId). A two-sided position is ambiguous — could be a market maker or a locked hedge.
  const opposingLeg = await db
    .select({ tokenId: watchedPositions.tokenId })
    .from(watchedPositions)
    .where(
      and(
        eq(watchedPositions.walletAddress, position.walletAddress),
        eq(watchedPositions.conditionId, position.conditionId),
        ne(watchedPositions.tokenId, position.tokenId),
      ),
    )
    .get();
  if (opposingLeg) {
    return skip('whale_two_sided_position');
  }

  if (position.initialValue < config.minPositionUsdc) {
    return skip(`position_too_small: ${position.initialValue.toFixed(2)} USDC`);
  }

  // Market must be active in our DB and have sufficient time remaining
  const market = await db
    .select({
      active: markets.active,
      acceptingOrders: markets.acceptingOrders,
      endDateIso: markets.endDateIso,
      question: markets.question,
      slug: markets.slug,
      eventSlug: markets.eventSlug,
    })
    .from(markets)
    .where(eq(markets.conditionId, position.conditionId))
    .get();

  if (!market?.active) {
    return skip('market_not_active');
  }

  // "Up or Down" markets are 5-minute binary crypto direction bets.
  // They cannot be copied: by the time a trade appears in the 15-second stream,
  // the ask has already moved to 0.99 or there is <1 minute left.
  if (/up or down/i.test(market.question)) {
    return skip('micro_market_up_or_down');
  }

  // Active != accepting_orders. The CLOB rejects new orders during the close-out window
  // even while the market is still flagged active. Skipping here avoids surfacing the
  // failure deep in the executor.
  if (!market.acceptingOrders) {
    return skip('market_not_accepting_orders');
  }

  base.marketQuestion = market.question;
  base.eventSlug = market.eventSlug ?? market.slug;

  if (market.endDateIso) {
    // Date-only strings (YYYY-MM-DD) are normalised to end-of-day UTC.
    // Full datetimes (from endDate on Gamma) are used as-is — critical for 5-min micro-markets.
    const dateStr = market.endDateIso.includes('T')
      ? market.endDateIso
      : `${market.endDateIso}T23:59:59Z`;
    const msRemaining = new Date(dateStr).getTime() - Date.now();

    // Coarse filter: skip markets with fewer hours than the configured threshold.
    // Set MIN_MARKET_HOURS_REMAINING=0 to allow micro-markets (5-min, 1-hour).
    if (
      config.minMarketHoursRemaining > 0 &&
      msRemaining < config.minMarketHoursRemaining * 60 * 60 * 1000
    ) {
      return skip(`market_expiring_soon: ${(msRemaining / 3_600_000).toFixed(1)}h left`);
    }

    // Hard floor: never enter with less than minMarketMinutesBuffer minutes remaining.
    if (msRemaining < config.minMarketMinutesBuffer * 60 * 1000) {
      return skip(`market_closing_imminently: ${(msRemaining / 60_000).toFixed(1)}min left`);
    }
  }

  // Get current ask from orderbook
  let currentAsk: number;
  try {
    const book = await clob.getOrderbook(position.tokenId);
    const bestAsk = book.asks[0];
    if (!bestAsk) return skip('no_liquidity');
    currentAsk = Number.parseFloat(bestAsk.price);
  } catch (err: unknown) {
    // 404 means the CLOB orderbook was removed after market resolution — expected once
    // our DB catches up (refreshOpenPositionMarkets will flip market.active to false).
    // Any other status is an unexpected fetch failure worth distinguishing in metrics.
    const status = (err as { status?: number } | null)?.status;
    return skip(status === 404 ? 'market_resolved_no_orderbook' : 'orderbook_fetch_failed');
  }

  // Hard cap: don't copy if the market has already mostly priced in the whale's thesis.
  // e.g. MAX_COPY_ASK=0.85 means skip if current ask > 0.85 (limited upside left).
  if (currentAsk > config.maxCopyAsk) {
    return {
      ...base,
      currentAsk,
      edge: position.avgPrice - currentAsk,
      kellySize: 0,
      status: 'skipped',
      skipReason: `ask_too_high: ${currentAsk.toFixed(3)} > ${config.maxCopyAsk}`,
    };
  }

  // Market-repricing guard: skip if the market has collapsed vs the whale's entry.
  // A high positive edge caused by a price DROP (not early entry) is a red flag, not an opportunity.
  // e.g. whale entered at 0.23, current ask is 0.05 → ratio 0.22 → market moved 78% against them.
  if (config.minWhaleAskRatio > 0 && position.avgPrice > 0) {
    const askRatio = currentAsk / position.avgPrice;
    if (askRatio < config.minWhaleAskRatio) {
      return {
        ...base,
        currentAsk,
        edge: position.avgPrice - currentAsk,
        kellySize: 0,
        status: 'skipped',
        skipReason: `market_repriced_against_whale: ask/entry=${askRatio.toFixed(3)} < ${config.minWhaleAskRatio}`,
      };
    }
  }

  const edge = position.avgPrice - currentAsk;

  if (edge < config.minEdge) {
    return skip(`edge_too_low: ${edge.toFixed(4)} < ${config.minEdge}`);
  }

  const { size } = kellySize(position.avgPrice, currentAsk, config);
  if (size <= 0) {
    return skip('kelly_size_zero');
  }

  return { ...base, currentAsk, edge, kellySize: size, status: 'ready' };
}
