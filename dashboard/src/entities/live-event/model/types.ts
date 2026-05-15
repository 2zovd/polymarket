// data field shape varies by event type — all optional for flexibility.
export interface LiveEventData {
  // whale_buy
  wallet?: string
  signalStatus?: 'ready' | 'skipped'
  executionStatus?: string
  skipReason?: string
  orderId?: string | null
  usdcSize?: number
  outcome?: string
  price?: number
  size?: number
  // large_trade (+ reuses wallet, price, size, usdcSize, outcome)
  side?: 'BUY' | 'SELL'
  // price_spike
  priceFrom?: number
  priceTo?: number
  changePp?: number
  direction?: 'up' | 'down'
  windowMs?: number
  // orderbook_thin
  totalAskUsdc?: number
  askLevels?: number
  totalBidUsdc?: number
}

export type LiveEventType = 'whale_buy' | 'large_trade' | 'price_spike' | 'orderbook_thin'

export interface LiveEvent {
  id: number
  type: LiveEventType | string
  marketId: string
  tokenId: string | null
  severity: 'low' | 'medium' | 'high'
  detectedAt: number
  question: string | null
  data: LiveEventData
}
