import { getDb } from '../../utils/db'

const PAGE_SIZE = 20

interface RawRow {
  wallet_address: string
  condition_id: string
  outcome: string
  size: number
  avg_price: number
  updated_at: string
  win_rate: number | null
  roi: number | null
  brier_score: number | null
  p_value: number | null
  resolved_trades: number
  is_sharp: number
  is_profitable: number
  question: string | null
  event_slug: string | null
  end_date_iso: string | null
  outcome_prices: string | null
  outcomes: string | null
  volume_num: number | null
  liquidity_num: number | null
}

function computeCurrentProb(row: RawRow): number | null {
  if (!row.outcome_prices || !row.outcomes) return null
  try {
    const prices: string[] = JSON.parse(row.outcome_prices)
    const names: string[] = JSON.parse(row.outcomes)
    const idx = names.findIndex((n) => n.toLowerCase() === row.outcome.toLowerCase())
    if (idx === -1 || idx >= prices.length) return null
    return parseFloat(prices[idx])
  } catch {
    return null
  }
}

function computeScore(row: RawRow): number {
  const brierSkill = row.brier_score != null ? Math.max(0, 1 - row.brier_score / 0.25) : 0.5
  const winRate = row.win_rate ?? 0.5
  // roi range [-1, 2] → [0, 1]
  const roiScore = row.roi != null ? Math.min(1, Math.max(0, (row.roi + 1) / 3)) : 0.5
  const sigBonus = row.p_value != null && row.p_value < 0.05 ? 1.0 : 0.5
  const whaleQuality = brierSkill * 0.4 + winRate * 0.35 + roiScore * 0.15 + sigBonus * 0.1
  const hoursAgo = (Date.now() - new Date(row.updated_at).getTime()) / 3_600_000
  const freshness = Math.exp(-hoursAgo / 72)
  return whaleQuality * (0.7 + 0.3 * freshness) * 100
}

function scoreGrade(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const sort = (query.sort as string) || 'score'
  const filter = (query.filter as string) || 'all'
  const minTrades = Math.max(0, Number(query.minTrades) || 5)

  const db = getDb()

  const filterClause =
    filter === 'sharp'
      ? 'AND ws.is_sharp = 1'
      : filter === 'profitable'
        ? 'AND ws.is_profitable = 1'
        : ''

  const rows = db
    .prepare(
      `SELECT
        wp.wallet_address, wp.condition_id, wp.outcome,
        wp.size, wp.avg_price, wp.updated_at,
        ws.win_rate, ws.roi, ws.brier_score, ws.p_value,
        ws.resolved_trades, ws.is_sharp, ws.is_profitable,
        m.question, m.event_slug, m.end_date_iso,
        m.outcome_prices, m.outcomes, m.volume_num, m.liquidity_num
       FROM watched_positions wp
       JOIN wallet_stats ws ON ws.wallet_address = wp.wallet_address
       JOIN markets m ON m.condition_id = wp.condition_id
       WHERE m.accepting_orders = 1
         AND m.active = 1
         AND m.closed = 0
         AND (m.end_date_iso IS NULL OR m.end_date_iso > datetime('now'))
         AND (ws.is_sharp = 1 OR ws.is_profitable = 1)
         AND ws.resolved_trades >= ? ${filterClause}`,
    )
    .all(minTrades) as RawRow[]

  const enriched = rows.map((r) => {
    const score = computeScore(r)
    const currentProb = computeCurrentProb(r)
    return {
      wallet_address: r.wallet_address,
      condition_id: r.condition_id,
      outcome: r.outcome,
      size: r.size,
      avg_price: r.avg_price,
      updated_at: r.updated_at,
      win_rate: r.win_rate,
      roi: r.roi,
      brier_score: r.brier_score,
      p_value: r.p_value,
      resolved_trades: r.resolved_trades,
      is_sharp: r.is_sharp,
      is_profitable: r.is_profitable,
      question: r.question,
      event_slug: r.event_slug,
      end_date_iso: r.end_date_iso,
      volume_num: r.volume_num,
      liquidity_num: r.liquidity_num,
      score,
      grade: scoreGrade(score),
      current_prob: currentProb,
      drift: currentProb != null ? currentProb - r.avg_price : null,
    }
  })

  if (sort === 'win_rate') {
    enriched.sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0))
  } else if (sort === 'roi') {
    enriched.sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0))
  } else if (sort === 'brier') {
    enriched.sort((a, b) => (a.brier_score ?? 1) - (b.brier_score ?? 1))
  } else {
    enriched.sort((a, b) => b.score - a.score)
  }

  const total = enriched.length
  const data = enriched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return { data, total, page, pageSize: PAGE_SIZE }
})
