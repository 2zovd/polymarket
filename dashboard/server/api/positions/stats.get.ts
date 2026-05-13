import { getDb } from '../../utils/db'

export default defineEventHandler(() => {
  const db = getDb()

  const rows = db
    .prepare(
      `SELECT status, is_dry_run,
              COUNT(*) as n,
              COALESCE(SUM(size), 0) as total_invested,
              COALESCE(SUM(payout), 0) as total_payout,
              COALESCE(SUM(pnl), 0) as total_pnl
       FROM open_positions
       GROUP BY status, is_dry_run`,
    )
    .all() as { status: string; is_dry_run: number; n: number; total_invested: number; total_payout: number; total_pnl: number }[]

  type Stats = { count: number; invested: number; payout: number; pnl: number }
  const make = (): Stats => ({ count: 0, invested: 0, payout: 0, pnl: 0 })

  const live: Record<string, Stats> = { won: make(), lost: make(), open: make() }
  const dryRun: Record<string, Stats> = { won: make(), lost: make(), open: make() }

  for (const r of rows) {
    const bucket = r.is_dry_run ? dryRun : live
    const key = r.status in bucket ? r.status : 'open'
    bucket[key].count += r.n
    bucket[key].invested += r.total_invested
    bucket[key].payout += r.total_payout
    bucket[key].pnl += r.total_pnl
  }

  const totalLiveResolved = live.won.count + live.lost.count
  const winRate = totalLiveResolved > 0 ? live.won.count / totalLiveResolved : null

  return { live, dryRun, winRate }
})
