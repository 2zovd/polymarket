import { getDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const status = (query.status as string) || 'active'
  const sort = query.sort === 'liquidity' ? 'liquidity_num' : query.sort === 'whales' ? 'whale_count' : 'volume_num'
  const search = ((query.q as string) || '').trim()
  const pageSize = 50
  const offset = (page - 1) * pageSize

  const db = getDb()

  let statusClause = ''
  if (status === 'active') statusClause = `AND active = 1 AND closed = 0 AND accepting_orders = 1 AND (end_date_iso IS NULL OR end_date_iso > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`
  else if (status === 'closed') statusClause = 'AND closed = 1'
  else if (status === 'resolved') statusClause = "AND status = 'resolved'"

  const searchClause = search ? `AND question LIKE ?` : ''
  const searchParam = search ? `%${search}%` : null

  const params: unknown[] = []
  if (searchParam) params.push(searchParam)
  params.push(pageSize, offset)

  const rows = db
    .prepare(
      `SELECT condition_id, question, slug, event_slug, status, end_date_iso,
              volume_num, liquidity_num, active, closed, accepting_orders,
              outcome_prices, outcomes, updated_at,
              (SELECT COUNT(DISTINCT wp.wallet_address)
               FROM watched_positions wp
               JOIN wallet_stats ws ON ws.wallet_address = wp.wallet_address
               WHERE wp.condition_id = markets.condition_id
                 AND (ws.is_sharp = 1 OR ws.is_profitable = 1)) AS whale_count
       FROM markets
       WHERE 1=1 ${statusClause} ${searchClause}
       ORDER BY ${sort} DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params) as Record<string, unknown>[]

  const totalParams: unknown[] = []
  if (searchParam) totalParams.push(searchParam)

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM markets WHERE 1=1 ${statusClause} ${searchClause}`,
      )
      .get(...totalParams) as { n: number }
  ).n

  return { data: rows, total, page, pageSize }
})
