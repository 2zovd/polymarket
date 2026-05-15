import { getDb } from '../../utils/db'

interface AnomalyRow {
  id: number
  type: string
  market_id: string | null
  severity: string
  detected_at: string
  metadata: string
}

export default defineEventHandler((event) => {
  const query = getQuery(event)
  // Optional: filter by market IDs (comma-separated)
  const marketIds = ((query.marketIds as string) || '').split(',').filter(Boolean)
  // Optional: filter by type
  const type = (query.type as string) || null

  const db = getDb()

  const typeClause = type ? `AND type = ?` : ''

  let rows: AnomalyRow[]

  if (marketIds.length > 0) {
    const placeholders = marketIds.map(() => '?').join(', ')
    const params: unknown[] = []
    if (type) params.push(type)
    params.push(...marketIds)

    rows = db
      .prepare(
        `SELECT id, type, market_id, severity, detected_at, metadata
         FROM anomalies
         WHERE market_id IN (${placeholders}) ${typeClause}
           AND detected_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-48 hours')
         ORDER BY detected_at DESC`,
      )
      .all(...params) as AnomalyRow[]
  } else {
    const params: unknown[] = []
    if (type) params.push(type)

    rows = db
      .prepare(
        `SELECT id, type, market_id, severity, detected_at, metadata
         FROM anomalies
         WHERE 1=1 ${typeClause}
           AND detected_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-48 hours')
         ORDER BY detected_at DESC
         LIMIT 200`,
      )
      .all(...params) as AnomalyRow[]
  }

  return {
    data: rows.map((r) => ({
      ...r,
      metadata: (() => {
        try {
          return JSON.parse(r.metadata)
        } catch {
          return {}
        }
      })(),
    })),
  }
})
