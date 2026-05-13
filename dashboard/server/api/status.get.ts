import { countRecentByLevel, getLogPath, readLastNLines } from '../utils/logReader'
import { getDb } from '../utils/db'

export default defineEventHandler(async () => {
  const db = getDb()

  const lastSignal = db
    .prepare(`SELECT dry_run, created_at FROM signals ORDER BY created_at DESC LIMIT 1`)
    .get() as { dry_run: number; created_at: string } | undefined

  const openCount = (
    db.prepare(`SELECT COUNT(*) as n FROM open_positions WHERE status = 'open'`).get() as {
      n: number
    }
  ).n

  const logPath = getLogPath()
  const lastLines = await readLastNLines(logPath, 1)
  const lastLogAt = lastLines[0]?.time ?? null

  const logErrors1h = await countRecentByLevel(logPath, 50)
  const logWarns1h = await countRecentByLevel(logPath, 40)

  return {
    lastSignalAt: lastSignal?.created_at ?? null,
    dryRun: lastSignal ? Boolean(lastSignal.dry_run) : true,
    openPositions: openCount,
    lastLogAt,
    logErrors1h,
    logWarns1h,
  }
})
