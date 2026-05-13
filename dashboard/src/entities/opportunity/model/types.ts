export interface OpportunityRow {
  wallet_address: string
  condition_id: string
  outcome: string
  size: number
  avg_price: number
  updated_at: string
  win_rate: number | null
  roi: number | null
  brier_score: number | null
  p_value: number | null
  resolved_trades: number
  is_sharp: number
  is_profitable: number
  question: string | null
  event_slug: string | null
  end_date_iso: string | null
  volume_num: number | null
  liquidity_num: number | null
  score: number
  grade: 'A' | 'B' | 'C' | 'D'
  current_prob: number | null
  drift: number | null
}
