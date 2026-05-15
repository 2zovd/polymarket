import { createEventStream } from 'h3'
import { getDb } from '../../utils/db'

interface LiveEventRow {
  id: number
  type: string
  market_id: string
  token_id: string | null
  severity: string
  data: string
  detected_at: number
  question: string | null
}

function fetchEvents(db: ReturnType<typeof getDb>, afterId: number, limit: number): LiveEventRow[] {
  return db
    .prepare(
      `SELECT le.id, le.type, le.market_id, le.token_id, le.severity, le.data, le.detected_at,
              m.question
       FROM live_events le
       LEFT JOIN markets m ON m.condition_id = le.market_id
       WHERE le.id > ?
       ORDER BY le.id ASC
       LIMIT ?`,
    )
    .all(afterId, limit) as LiveEventRow[]
}

function parseRow(row: LiveEventRow) {
  return {
    id: row.id,
    type: row.type,
    marketId: row.market_id,
    tokenId: row.token_id,
    severity: row.severity,
    detectedAt: row.detected_at,
    question: row.question,
    data: (() => {
      try { return JSON.parse(row.data) } catch { return {} }
    })(),
  }
}

export default defineEventHandler(async (event) => {
  const stream = createEventStream(event)
  const db = getDb()

  // Seed with last 50 events so the client has something to show immediately.
  const seedRows = db
    .prepare(
      `SELECT le.id, le.type, le.market_id, le.token_id, le.severity, le.data, le.detected_at,
              m.question
       FROM live_events le
       LEFT JOIN markets m ON m.condition_id = le.market_id
       ORDER BY le.id DESC
       LIMIT 50`,
    )
    .all() as LiveEventRow[]

  // Reverse so we emit oldest → newest (client prepends new items at top).
  seedRows.reverse()

  let lastId = 0
  for (const row of seedRows) {
    await stream.push(JSON.stringify(parseRow(row)))
    if (row.id > lastId) lastId = row.id
  }

  const timer = setInterval(async () => {
    const rows = fetchEvents(db, lastId, 100)
    for (const row of rows) {
      await stream.push(JSON.stringify(parseRow(row)))
      if (row.id > lastId) lastId = row.id
    }
  }, 2000)

  stream.onClosed(() => clearInterval(timer))

  return stream.send()
})
