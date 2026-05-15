import { getDb } from '../../utils/db'

interface RawRow {
  condition_id: string
  outcome: string
  whale_count: number
  total_usdc: number
  weighted_avg_entry: number
  question: string | null
  event_slug: string | null
  end_date_iso: string | null
  outcome_prices: string | null
  outcomes: string | null
  whales_json: string
}

function computeCurrentProb(outcomePrices: string | null, outcomes: string | null, outcome: string): number | null {
  if (!outcomePrices || !outcomes) return null
  try {
    const prices: string[] = JSON.parse(outcomePrices)
    const names: string[] = JSON.parse(outcomes)
    const idx = names.findIndex((n) => n.toLowerCase() === outcome.toLowerCase())
    if (idx === -1 || idx >= prices.length) return null
    return parseFloat(prices[idx])
  } catch {
    return null
  }
}

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const sort = (query.sort as string) || 'total_usdc'
  const filter = (query.filter as string) || 'all'
  const minTrades = Math.max(0, Number(query.minTrades) || 5)
  const horizon = (query.horizon as string) || 'all'
  const minSize = Math.max(0, Number(query.minSize) || 0)

  const db = getDb()

  const filterClause =
    filter === 'sharp'
      ? 'AND ws.is_sharp = 1'
      : filter === 'profitable'
        ? 'AND ws.is_profitable = 1'
        : ''

  const horizonClause =
    horizon === '2h'  ? `AND m.end_date_iso <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+2 hours')`
    : horizon === '6h'  ? `AND m.end_date_iso <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+6 hours')`
    : horizon === '1d'  ? `AND m.end_date_iso <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+1 day')`
    : horizon === '3d'  ? `AND m.end_date_iso <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+3 days')`
    : horizon === '7d'  ? `AND m.end_date_iso <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+7 days')`
    : horizon === '30d' ? `AND m.end_date_iso <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+30 days')`
    : ''

  const sizeClause = minSize > 0 ? `AND (wp.size * wp.avg_price) >= ${minSize}` : ''

  const rows = db
    .prepare(
      `SELECT
        wp.condition_id,
        wp.outcome,
        COUNT(DISTINCT wp.wallet_address)            AS whale_count,
        SUM(wp.size * wp.avg_price)                  AS total_usdc,
        SUM(wp.size * wp.avg_price) / SUM(wp.size)   AS weighted_avg_entry,
        MAX(m.question)       AS question,
        MAX(m.event_slug)     AS event_slug,
        MAX(m.end_date_iso)   AS end_date_iso,
        MAX(m.outcome_prices) AS outcome_prices,
        MAX(m.outcomes)       AS outcomes,
        json_group_array(json_object(
          'wallet_address', wp.wallet_address,
          'size',           wp.size,
          'avg_price',      wp.avg_price,
          'win_rate',       ws.win_rate,
          'roi',            ws.roi,
          'brier_score',    ws.brier_score,
          'is_sharp',       ws.is_sharp,
          'is_profitable',  ws.is_profitable
        )) AS whales_json
       FROM watched_positions wp
       JOIN wallet_stats ws ON ws.wallet_address = wp.wallet_address
       JOIN markets m ON m.condition_id = wp.condition_id
       WHERE m.accepting_orders = 1
         AND m.active = 1
         AND m.closed = 0
         AND (m.end_date_iso IS NULL OR m.end_date_iso > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
         AND m.question NOT LIKE '%Up or Down%'
         AND (ws.is_sharp = 1 OR ws.is_profitable = 1)
         AND ws.resolved_trades >= ? ${filterClause} ${horizonClause} ${sizeClause}
       GROUP BY wp.condition_id, wp.outcome`,
    )
    .all(minTrades) as RawRow[]

  const enriched = rows.map((r) => {
    const currentProb = computeCurrentProb(r.outcome_prices, r.outcomes, r.outcome)
    let whales: unknown[] = []
    try { whales = JSON.parse(r.whales_json) } catch { /* empty */ }
    return {
      condition_id: r.condition_id,
      outcome: r.outcome,
      whale_count: r.whale_count,
      total_usdc: r.total_usdc,
      weighted_avg_entry: r.weighted_avg_entry,
      question: r.question,
      event_slug: r.event_slug,
      end_date_iso: r.end_date_iso,
      current_prob: currentProb,
      drift: currentProb != null ? currentProb - r.weighted_avg_entry : null,
      whales,
    }
  })

  if (sort === 'whale_count') {
    enriched.sort((a, b) => b.whale_count - a.whale_count)
  } else {
    enriched.sort((a, b) => b.total_usdc - a.total_usdc)
  }

  return { data: enriched, total: enriched.length }
})
