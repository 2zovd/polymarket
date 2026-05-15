import { getDb } from '../../utils/db'

const ALLOWED_SORT = new Set(['roi', 'win_rate', 'resolved_trades', 'updated_at', 'brier_score', 'total_trades'])

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const filter = (query.filter as string) || 'all'
  const sortRaw = (query.sort as string) || 'roi'
  const sort = ALLOWED_SORT.has(sortRaw) ? sortRaw : 'roi'
  const order = query.order === 'asc' ? 'ASC' : 'DESC'
  const search = ((query.q as string) || '').trim().toLowerCase()
  const pageSize = 50
  const offset = (page - 1) * pageSize

  const db = getDb()

  let filterClause = ''
  if (filter === 'sharp') filterClause = 'AND ws.is_sharp = 1'
  else if (filter === 'profitable') filterClause = 'AND ws.is_profitable = 1'

  const searchClause = search ? `AND LOWER(ws.wallet_address) LIKE ?` : ''
  const searchParam = search ? `%${search}%` : null
  const baseParams: unknown[] = searchParam ? [searchParam] : []

  const rows = db
    .prepare(
      `SELECT ws.*,
              (SELECT COUNT(*) FROM watched_positions wp WHERE wp.wallet_address = ws.wallet_address) as watched_count
       FROM wallet_stats ws
       WHERE 1=1 ${filterClause} ${searchClause}
       ORDER BY ws.${sort} ${order} NULLS LAST
       LIMIT ? OFFSET ?`,
    )
    .all(...baseParams, pageSize, offset) as Record<string, unknown>[]

  const total = (
    db
      .prepare(`SELECT COUNT(*) as n FROM wallet_stats ws WHERE 1=1 ${filterClause} ${searchClause}`)
      .get(...baseParams) as { n: number }
  ).n

  return { data: rows, total, page, pageSize }
})
