import { getDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const status = (query.status as string) || 'all'
  const since = (query.since as string) || 'all'
  const pageSize = 50
  const offset = (page - 1) * pageSize

  const db = getDb()

  let sinceClause = ''
  if (since === '1h') sinceClause = `AND s.created_at > datetime('now', '-1 hour')`
  else if (since === '24h') sinceClause = `AND s.created_at > datetime('now', '-1 day')`
  else if (since === '7d') sinceClause = `AND s.created_at > datetime('now', '-7 days')`

  const statusClause = status !== 'all' ? `AND s.status = '${status.replace(/'/g, "''")}'` : ''

  const rows = db
    .prepare(
      `SELECT s.id, s.wallet_address, s.condition_id, s.token_id, s.outcome,
              s.whale_avg_price, s.current_ask, s.edge, s.kelly_size,
              s.executed_size, s.order_id, s.status, s.skip_reason, s.dry_run, s.created_at,
              m.question, m.event_slug, m.slug
       FROM signals s
       LEFT JOIN markets m ON m.condition_id = s.condition_id
       WHERE 1=1 ${statusClause} ${sinceClause}
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(pageSize, offset) as Record<string, unknown>[]

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM signals s WHERE 1=1 ${statusClause} ${sinceClause}`,
      )
      .get() as { n: number }
  ).n

  return { data: rows, total, page, pageSize }
})
