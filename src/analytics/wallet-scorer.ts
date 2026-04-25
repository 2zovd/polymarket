import { cumulativeStdNormalProbability, mean, sampleStandardDeviation } from 'simple-statistics';
import type { DataApiActivity } from '../api/data.js';

// Minimum resolved trades required to compute statistically meaningful scores.
const MIN_RESOLVED = 30;
// Sharp wallet thresholds (per plan).
const SHARP_ROI = 0.05;
const SHARP_BRIER = 0.22;
const SHARP_P_VALUE = 0.05;

export interface WalletScore {
  totalTrades: number;
  resolvedTrades: number;
  winRate: number | null;
  roi: number | null;
  brierScore: number | null;
  pValue: number | null;
  isSharp: boolean;
  isProfitable: boolean;
}

export interface ResolvedMarketMap {
  // conditionId → outcomePrices as parsed number array, e.g. [1, 0] or [0, 1]
  [conditionId: string]: number[];
}

/**
 * Computes wallet score from raw activity + resolved market outcome data.
 *
 * Only BUY trades in resolved markets contribute to ROI/Brier/win-rate.
 * Sell-side is excluded: sells represent exits, not predictions.
 *
 * p-value uses normal approximation to t-distribution (valid for n ≥ 30).
 */
export function scoreWallet(
  activity: DataApiActivity[],
  resolvedMarkets: ResolvedMarketMap,
): WalletScore {
  const totalTrades = activity.filter((a) => a.type === 'TRADE').length;

  const scorable = activity.filter(
    (a) =>
      a.type === 'TRADE' &&
      a.side === 'BUY' &&
      a.conditionId in resolvedMarkets &&
      a.outcomeIndex !== undefined,
  );

  if (scorable.length < MIN_RESOLVED) {
    return {
      totalTrades,
      resolvedTrades: scorable.length,
      winRate: null,
      roi: null,
      brierScore: null,
      pValue: null,
      isSharp: false,
      isProfitable: false,
    };
  }

  let wins = 0;
  let totalCapital = 0;
  let totalPnl = 0;
  const roiPerTrade: number[] = [];
  const brierPerTrade: number[] = [];

  for (const trade of scorable) {
    const prices = resolvedMarkets[trade.conditionId];
    if (!prices) continue;
    const outcome = prices[trade.outcomeIndex] ?? -1;
    if (outcome === -1) continue; // outcomeIndex out of range — skip

    const capital = trade.usdcSize > 0 ? trade.usdcSize : trade.price * trade.size;
    const pnl = (outcome - trade.price) * trade.size;

    if (outcome === 1) wins++;
    totalCapital += capital;
    totalPnl += pnl;
    roiPerTrade.push(capital > 0 ? pnl / capital : 0);
    brierPerTrade.push((trade.price - outcome) ** 2);
  }

  const resolvedTrades = roiPerTrade.length;
  if (resolvedTrades < MIN_RESOLVED) {
    return {
      totalTrades,
      resolvedTrades,
      winRate: null,
      roi: null,
      brierScore: null,
      pValue: null,
      isSharp: false,
      isProfitable: false,
    };
  }

  const roi = totalCapital > 0 ? totalPnl / totalCapital : 0;
  const winRate = wins / resolvedTrades;
  const brierScore = mean(brierPerTrade);

  // Two-tailed p-value via normal approximation to t-distribution (valid for n ≥ 30).
  const tStat =
    mean(roiPerTrade) / (sampleStandardDeviation(roiPerTrade) / Math.sqrt(resolvedTrades));
  const pValue = 2 * (1 - cumulativeStdNormalProbability(Math.abs(tStat)));

  const isSharp =
    pValue < SHARP_P_VALUE &&
    roi > SHARP_ROI &&
    brierScore < SHARP_BRIER &&
    resolvedTrades >= MIN_RESOLVED;

  const isProfitable = pValue < SHARP_P_VALUE && roi > 0 && resolvedTrades >= MIN_RESOLVED;

  return { totalTrades, resolvedTrades, winRate, roi, brierScore, pValue, isSharp, isProfitable };
}

/**
 * Parses outcomePrices JSON strings from the DB into a lookup map.
 * Only includes markets where resolution is unambiguous (one outcome == 1).
 */
// Resolution threshold: outcome price ≥ 0.95 is treated as a winner (= 1), < 0.05 as loser (= 0).
// Gamma never returns exact "1"/"0" — uses values like "0.9999989..." or "0.000001...".
const WINNER_THRESHOLD = 0.95;

export function buildResolvedMarketMap(
  dbRows: { conditionId: string; outcomePrices: string | null }[],
): ResolvedMarketMap {
  const map: ResolvedMarketMap = {};
  for (const row of dbRows) {
    if (!row.outcomePrices) continue;
    try {
      const raw: number[] = (JSON.parse(row.outcomePrices) as string[]).map(Number);
      // Binarize: ≥ threshold → 1 (winner), < threshold → 0 (loser).
      // Skip markets where no outcome crossed the threshold (e.g. old ["0","0"] FPMM markets).
      if (!raw.some((p) => p >= WINNER_THRESHOLD)) continue;
      map[row.conditionId] = raw.map((p) => (p >= WINNER_THRESHOLD ? 1 : 0));
    } catch {
      // malformed JSON — skip
    }
  }
  return map;
}
