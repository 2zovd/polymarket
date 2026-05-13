import { getDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const since = (query.since as string) || '7d'

  let sinceExpr = "-7 days"
  if (since === '24h') sinceExpr = "-1 day"
  else if (since === '1h') sinceExpr = "-1 hour"
  else if (since === 'all') sinceExpr = "-100 years"

  const db = getDb()

  const byStatus = db
    .prepare(`SELECT status, COUNT(*) as n FROM signals GROUP BY status`)
    .all() as { status: string; n: number }[]

  const skipReasons = db
    .prepare(
      `SELECT skip_reason, COUNT(*) as n
       FROM signals
       WHERE status = 'skipped'
         AND created_at > datetime('now', ?)
       GROUP BY skip_reason
       ORDER BY n DESC
       LIMIT 20`,
    )
    .all(sinceExpr) as { skip_reason: string | null; n: number }[]

  const statusMap: Record<string, number> = {}
  for (const row of byStatus) statusMap[row.status] = row.n

  const total = Object.values(statusMap).reduce((a, b) => a + b, 0)
  const executed = (statusMap['executed'] ?? 0) + (statusMap['dry-run'] ?? 0)
  const execRate = total > 0 ? executed / total : 0

  return {
    byStatus: statusMap,
    skipReasons: skipReasons.map((r) => ({ reason: r.skip_reason ?? 'unknown', count: r.n })),
    execRate,
    total,
  }
})
