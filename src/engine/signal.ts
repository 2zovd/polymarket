import { eq } from 'drizzle-orm';
import type { ClobClientWrapper } from '../api/clob.js';
import type { DbClient } from '../db/index.js';
import { markets } from '../db/schema.js';
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
  marketSlug: string;
}

export async function generateSignal(
  position: WhalePosition,
  walletScore: { pValue: number | null; roi: number | null; resolvedTrades: number },
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
    marketSlug: '',
  };

  function skip(reason: string): Signal {
    return { ...base, currentAsk: 0, edge: 0, kellySize: 0, status: 'skipped', skipReason: reason };
  }

  // Risk control — skip if we already hold this token
  if (openTokenIds.has(position.tokenId)) {
    return skip('already_positioned');
  }

  // Quality gate — wallet must meet all thresholds
  if (!walletScore.roi || walletScore.roi < config.minWhaleRoi) {
    return skip(`wallet_roi_low: ${walletScore.roi?.toFixed(3) ?? 'null'}`);
  }
  if (!walletScore.pValue || walletScore.pValue > config.minWhalePvalue) {
    return skip(`wallet_pvalue_high: ${walletScore.pValue?.toFixed(4) ?? 'null'}`);
  }
  if (walletScore.resolvedTrades < config.minWhaleTrades) {
    return skip(`wallet_trades_low: ${walletScore.resolvedTrades}`);
  }
  if (position.initialValue < config.minPositionUsdc) {
    return skip(`position_too_small: ${position.initialValue.toFixed(2)} USDC`);
  }

  // Market must be active in our DB and have sufficient time remaining
  const market = await db
    .select({
      active: markets.active,
      endDateIso: markets.endDateIso,
      question: markets.question,
      slug: markets.slug,
    })
    .from(markets)
    .where(eq(markets.conditionId, position.conditionId))
    .get();

  if (!market?.active) {
    return skip('market_not_active');
  }

  base.marketQuestion = market.question;
  base.marketSlug = market.slug;

  if (market.endDateIso) {
    // Date-only strings (YYYY-MM-DD) are normalised to end-of-day UTC.
    // Full datetimes (from endDate on Gamma) are used as-is — critical for 5-min micro-markets.
    const dateStr = market.endDateIso.includes('T')
      ? market.endDateIso
      : `${market.endDateIso}T23:59:59Z`;
    const msRemaining = new Date(dateStr).getTime() - Date.now();

    // Coarse filter: skip markets with fewer hours than the configured threshold.
    // Set MIN_MARKET_HOURS_REMAINING=0 to allow micro-markets (5-min, 1-hour).
    if (config.minMarketHoursRemaining > 0 && msRemaining < config.minMarketHoursRemaining * 60 * 60 * 1000) {
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
  } catch {
    return skip('orderbook_fetch_failed');
  }

  const edge = position.avgPrice - currentAsk;
  if (edge < config.minEdgePct) {
    // Preserve actual currentAsk and edge for diagnostics (skip() zeroes them)
    return {
      ...base,
      currentAsk,
      edge,
      kellySize: 0,
      status: 'skipped',
      skipReason: `edge_too_low: ${edge.toFixed(4)} (need ${config.minEdgePct})`,
    };
  }

  const { size } = kellySize(position.avgPrice, currentAsk, config);
  if (size <= 0) {
    return skip('kelly_size_zero');
  }

  return { ...base, currentAsk, edge, kellySize: size, status: 'ready' };
}
