import type { AppConfig } from '../types.js';

export interface SizeResult {
  size: number;
  fullKelly: number;
  fractionalKelly: number;
}

/**
 * Kelly criterion sizing for a binary prediction market BUY.
 *
 * p = whale's avg entry price (our probability estimate — they thought this was fair value)
 * q = current ask price (our actual entry)
 * edge = p - q  (positive means price hasn't moved past whale's entry)
 * fullKelly = edge / (1 - q)
 * size = min(fullKelly * KELLY_CAP * PORTFOLIO_SIZE, MAX_ORDER_SIZE_USDC)
 *
 * Returns size in USDC. Returns size=0 when edge ≤ 0 or result < 1 USDC.
 */
export function kellySize(
  whaleAvgPrice: number,
  currentAsk: number,
  config: Pick<AppConfig, 'kellyCap' | 'portfolioSize' | 'maxOrderSizeUsdc'>,
): SizeResult {
  const edge = whaleAvgPrice - currentAsk;
  if (edge <= 0 || currentAsk >= 1) {
    return { size: 0, fullKelly: 0, fractionalKelly: 0 };
  }

  const fullKelly = edge / (1 - currentAsk);
  const fractionalKelly = fullKelly * config.kellyCap;
  const raw = fractionalKelly * config.portfolioSize;
  const size = Math.min(raw, config.maxOrderSizeUsdc);

  return { size: size < 1 ? 0 : size, fullKelly, fractionalKelly };
}
