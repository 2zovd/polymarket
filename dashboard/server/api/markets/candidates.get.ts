import { getDb } from '../../utils/db'

export default defineEventHandler(() => {
  const db = getDb()

  const rows = db
    .prepare(
      `SELECT wp.condition_id,
              COUNT(DISTINCT wp.wallet_address) as whale_count,
              SUM(wp.size * wp.avg_price) as total_exposure,
              m.question, m.event_slug, m.active, m.closed, m.accepting_orders,
              m.volume_num, m.end_date_iso, m.outcome_prices, m.outcomes,
              GROUP_CONCAT(DISTINCT wp.outcome) as outcomes_held
       FROM watched_positions wp
       JOIN markets m ON m.condition_id = wp.condition_id
       JOIN wallet_stats ws ON ws.wallet_address = wp.wallet_address
       WHERE (ws.is_sharp = 1 OR ws.is_profitable = 1)
         AND m.accepting_orders = 1
         AND (m.end_date_iso IS NULL OR m.end_date_iso > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
       GROUP BY wp.condition_id
       ORDER BY whale_count DESC, total_exposure DESC
       LIMIT 50`,
    )
    .all() as Record<string, unknown>[]

  return { data: rows }
})
