export interface MarketRow {
  condition_id: string
  question: string
  slug: string
  event_slug: string | null
  status: string
  end_date_iso: string
  volume_num: number
  liquidity_num: number
  active: number
  closed: number
  accepting_orders: number
  outcome_prices: string | null
  outcomes: string | null
  updated_at: string
  whale_count: number
}

export interface MarketCandidate {
  condition_id: string
  whale_count: number
  total_exposure: number
  question: string
  event_slug: string | null
  active: number
  closed: number
  accepting_orders: number
  volume_num: number
  end_date_iso: string
  outcome_prices: string | null
  outcomes: string | null
  outcomes_held: string | null
}

export function parseOutcomePrices(raw: string | null): number[] {
  if (!raw) return []
  try { return JSON.parse(raw).map(Number) } catch { return [] }
}

export function parseOutcomes(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}
