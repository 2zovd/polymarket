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
}

export async function generateSignal(
  position: WhalePosition,
  walletScore: { pValue: number | null; roi: number | null; resolvedTrades: number },
  clob: ClobClientWrapper,
  db: DbClient,
  config: AppConfig,
): Promise<Signal> {
  const base = {
    walletAddress: position.walletAddress,
    conditionId: position.conditionId,
    tokenId: position.tokenId,
    outcome: position.outcome,
    whaleAvgPrice: position.avgPrice,
  };

  function skip(reason: string): Signal {
    return { ...base, currentAsk: 0, edge: 0, kellySize: 0, status: 'skipped', skipReason: reason };
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

  // Market must be active in our DB
  const market = await db
    .select({ active: markets.active })
    .from(markets)
    .where(eq(markets.conditionId, position.conditionId))
    .get();

  if (!market?.active) {
    return skip('market_not_active');
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
