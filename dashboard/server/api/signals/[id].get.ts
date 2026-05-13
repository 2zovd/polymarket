import { getDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, message: 'Invalid id' })

  const db = getDb()

  const row = db
    .prepare(
      `SELECT s.*,
              m.question, m.event_slug, m.end_date_iso, m.status as market_status,
              m.outcome_prices, m.outcomes,
              op.id as op_id, op.size as op_size, op.entry_price, op.entry_at,
              op.status as op_status, op.payout, op.pnl, op.resolved_at
       FROM signals s
       LEFT JOIN markets m ON m.condition_id = s.condition_id
       LEFT JOIN open_positions op ON op.signal_id = s.id
       WHERE s.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined

  if (!row) throw createError({ statusCode: 404, message: 'Signal not found' })

  return row
})
