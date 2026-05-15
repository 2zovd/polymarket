export interface LiveEventData {
  wallet: string
  price: number
  size: number
  usdcSize: number
  outcome: string
  signalStatus: 'ready' | 'skipped'
  skipReason?: string
  executionStatus?: string
  orderId?: string | null
}

export interface LiveEvent {
  id: number
  type: string
  marketId: string
  tokenId: string | null
  severity: 'low' | 'medium' | 'high'
  detectedAt: number
  question: string | null
  data: LiveEventData
}
