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

function fetchAfter(db: ReturnType<typeof getDb>, afterId: number, limit: number): LiveEventRow[] {
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

export default defineEventHandler((event) => {
  const res = event.node.res
  const req = event.node.req

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const db = getDb()

  function write(data: string) {
    res.write(`data: ${data}\n\n`)
  }

  // Seed with last 50 events in chronological order.
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

  seedRows.reverse()

  let lastId = 0
  for (const row of seedRows) {
    write(JSON.stringify(parseRow(row)))
    if (row.id > lastId) lastId = row.id
  }

  // Heartbeat every 15s to keep the connection alive through proxies.
  const pingTimer = setInterval(() => { res.write(': ping\n\n') }, 15_000)

  // Poll for new rows every 2s.
  const pollTimer = setInterval(() => {
    try {
      const rows = fetchAfter(db, lastId, 100)
      for (const row of rows) {
        write(JSON.stringify(parseRow(row)))
        if (row.id > lastId) lastId = row.id
      }
    } catch { /* DB may be briefly locked during WAL checkpoint */ }
  }, 2_000)

  req.on('close', () => {
    clearInterval(pingTimer)
    clearInterval(pollTimer)
    res.end()
  })

  // Return undefined so Nitro doesn't close the response.
  return undefined
})
