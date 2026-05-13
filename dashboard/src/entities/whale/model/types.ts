export interface WhaleRow {
  wallet_address: string
  total_trades: number
  resolved_trades: number
  win_rate: number | null
  roi: number | null
  brier_score: number | null
  p_value: number | null
  is_sharp: number
  is_profitable: number
  avg_position_size_usdc: number | null
  churn_ratio: number | null
  updated_at: string
  watched_count: number
}

export interface WhaleDetail {
  stats: WhaleRow
  positions: WatchedPositionRow[]
  signals: WhaleSignalRow[]
}

export interface WatchedPositionRow {
  token_id: string
  condition_id: string
  outcome: string
  size: number
  avg_price: number
  updated_at: string
  first_seen_at: string | null
  question: string | null
  event_slug: string | null
  active: number | null
  closed: number | null
  accepting_orders: number | null
  end_date_iso: string | null
  outcome_prices: string | null
}

export interface WhaleSignalRow {
  id: number
  condition_id: string
  outcome: string
  whale_avg_price: number
  current_ask: number
  edge: number
  status: string
  skip_reason: string | null
  created_at: string
  question: string | null
  event_slug: string | null
}
