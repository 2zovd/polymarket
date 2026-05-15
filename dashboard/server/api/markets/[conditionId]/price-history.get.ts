import { getDb } from '../../../utils/db'

interface TradePoint {
  t: string
  p: number
  size: number
  is_whale: number
}

interface WhaleEntry {
  first_seen_at: string | null
  avg_price: number
}

export default defineEventHandler((event) => {
  const conditionId = getRouterParam(event, 'conditionId')
  if (!conditionId) throw createError({ statusCode: 400, message: 'Missing conditionId' })

  const query = getQuery(event)
  const walletAddress = (query.walletAddress as string) || null
  const outcome = (query.outcome as string) || null
  const since = (query.since as string) || 'all'

  const db = getDb()

  const sinceClause =
    since === '7d'
      ? `AND t.match_time >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')`
      : since === '30d'
        ? `AND t.match_time >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')`
        : ''

  const outcomeClause = outcome ? `AND t.outcome = ?` : ''

  const params: unknown[] = [conditionId]
  if (outcome) params.push(outcome)

  const points = db
    .prepare(
      `SELECT t.match_time AS t, t.price AS p, t.size,
              CASE WHEN ws.is_sharp = 1 OR ws.is_profitable = 1 THEN 1 ELSE 0 END AS is_whale
       FROM trades t
       LEFT JOIN wallet_stats ws ON ws.wallet_address = t.wallet_address
       WHERE t.market = ? ${outcomeClause} ${sinceClause}
       ORDER BY t.match_time ASC
       LIMIT 500`,
    )
    .all(...params) as TradePoint[]

  let whaleEntryAt: string | null = null
  let whaleAvgPrice: number | null = null

  if (walletAddress && outcome) {
    const wp = db
      .prepare(
        `SELECT first_seen_at, avg_price
         FROM watched_positions
         WHERE wallet_address = ? AND condition_id = ? AND outcome = ?`,
      )
      .get(walletAddress, conditionId, outcome) as WhaleEntry | undefined

    if (wp) {
      whaleEntryAt = wp.first_seen_at
      whaleAvgPrice = wp.avg_price
    }
  }

  return {
    points,
    whaleEntryAt,
    whaleAvgPrice,
    insufficientData: points.length < 5,
  }
})
