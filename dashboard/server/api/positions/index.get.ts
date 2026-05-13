import { getDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const status = (query.status as string) || 'all'
  const isDryRun = query.isDryRun !== undefined ? Number(query.isDryRun) : -1
  const pageSize = 50
  const offset = (page - 1) * pageSize

  const db = getDb()

  const statusClause = status !== 'all' ? `AND op.status = '${status.replace(/'/g, "''")}'` : ''
  const dryRunClause = isDryRun !== -1 ? `AND op.is_dry_run = ${isDryRun ? 1 : 0}` : ''

  const rows = db
    .prepare(
      `SELECT op.id, op.outcome, op.size, op.entry_price, op.entry_at,
              op.is_dry_run, op.status, op.payout, op.pnl, op.resolved_at,
              s.wallet_address, s.edge, s.whale_avg_price,
              m.question, m.event_slug
       FROM open_positions op
       JOIN signals s ON s.id = op.signal_id
       LEFT JOIN markets m ON m.condition_id = op.condition_id
       WHERE 1=1 ${statusClause} ${dryRunClause}
       ORDER BY op.entry_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(pageSize, offset) as Record<string, unknown>[]

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM open_positions op WHERE 1=1 ${statusClause} ${dryRunClause}`,
      )
      .get() as { n: number }
  ).n

  return { data: rows, total, page, pageSize }
})
