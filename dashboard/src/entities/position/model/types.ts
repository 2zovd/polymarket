export type PositionStatus = 'open' | 'won' | 'lost'

export interface OpenPositionRow {
  id: number
  token_id: string
  condition_id: string
  outcome: string
  size: number
  entry_price: number
  entry_at: string
  is_dry_run: number
  wallet_address: string
  edge: number
  kelly_size: number
  whale_avg_price: number
  question: string | null
  event_slug: string | null
  end_date_iso: string | null
  outcome_prices: string | null
  outcomes: string | null
}

export interface ResolvedPositionRow {
  id: number
  outcome: string
  size: number
  entry_price: number
  entry_at: string
  is_dry_run: number
  status: PositionStatus
  payout: number | null
  pnl: number | null
  resolved_at: string | null
  wallet_address: string
  edge: number
  whale_avg_price: number
  question: string | null
  event_slug: string | null
}

export interface PositionStats {
  live: Record<string, { count: number; invested: number; payout: number; pnl: number }>
  dryRun: Record<string, { count: number; invested: number; payout: number; pnl: number }>
  winRate: number | null
}
