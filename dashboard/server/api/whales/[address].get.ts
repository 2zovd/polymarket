import { getDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const address = getRouterParam(event, 'address')
  if (!address) throw createError({ statusCode: 400, message: 'Missing address' })

  const db = getDb()

  const stats = db
    .prepare(`SELECT * FROM wallet_stats WHERE wallet_address = ?`)
    .get(address) as Record<string, unknown> | undefined

  if (!stats) throw createError({ statusCode: 404, message: 'Whale not found' })

  const positions = db
    .prepare(
      `SELECT wp.token_id, wp.condition_id, wp.outcome, wp.size, wp.avg_price,
              wp.updated_at, wp.first_seen_at,
              m.question, m.event_slug, m.active, m.closed, m.accepting_orders, m.end_date_iso, m.outcome_prices
       FROM watched_positions wp
       LEFT JOIN markets m ON m.condition_id = wp.condition_id
       WHERE wp.wallet_address = ?
       ORDER BY (wp.size * wp.avg_price) DESC
       LIMIT 100`,
    )
    .all(address) as Record<string, unknown>[]

  const recentSignals = db
    .prepare(
      `SELECT s.id, s.condition_id, s.outcome, s.whale_avg_price, s.current_ask,
              s.edge, s.status, s.skip_reason, s.created_at,
              m.question, m.event_slug
       FROM signals s
       LEFT JOIN markets m ON m.condition_id = s.condition_id
       WHERE s.wallet_address = ?
       ORDER BY s.created_at DESC
       LIMIT 20`,
    )
    .all(address) as Record<string, unknown>[]

  return { stats, positions, signals: recentSignals }
})
