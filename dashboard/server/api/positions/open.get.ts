import { getDb } from '../../utils/db'

export default defineEventHandler(() => {
  const db = getDb()

  const rows = db
    .prepare(
      `SELECT op.id, op.token_id, op.condition_id, op.outcome, op.size,
              op.entry_price, op.entry_at, op.is_dry_run,
              s.wallet_address, s.edge, s.kelly_size, s.whale_avg_price,
              m.question, m.event_slug, m.end_date_iso, m.outcome_prices, m.outcomes
       FROM open_positions op
       JOIN signals s ON s.id = op.signal_id
       LEFT JOIN markets m ON m.condition_id = op.condition_id
       WHERE op.status = 'open'
       ORDER BY op.entry_at DESC`,
    )
    .all() as Record<string, unknown>[]

  return { data: rows }
})
