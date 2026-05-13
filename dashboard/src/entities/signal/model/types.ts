export type SignalStatus = 'executed' | 'skipped' | 'dry-run' | 'error'

export interface SignalRow {
  id: number
  wallet_address: string
  condition_id: string
  token_id: string
  outcome: string
  whale_avg_price: number
  current_ask: number
  edge: number
  kelly_size: number
  executed_size: number
  order_id: string | null
  status: SignalStatus
  skip_reason: string | null
  dry_run: number
  created_at: string
  question: string | null
  event_slug: string | null
  slug: string | null
}

export interface SignalStats {
  byStatus: Record<string, number>
  skipReasons: { reason: string; count: number }[]
  execRate: number
  total: number
}
