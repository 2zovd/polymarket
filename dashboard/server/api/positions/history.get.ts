import { getDb } from '../../utils/db'

export default defineEventHandler(() => {
  const db = getDb()

  const rows = db
    .prepare(
      `SELECT op.resolved_at, op.pnl, op.size, op.is_dry_run, op.status,
              m.question, m.event_slug
       FROM open_positions op
       LEFT JOIN markets m ON m.condition_id = op.condition_id
       WHERE op.status IN ('won', 'lost')
       ORDER BY op.resolved_at ASC`,
    )
    .all() as Record<string, unknown>[]

  return { data: rows }
})
