import type { Logger } from 'pino';
import type { DbClient } from '../db/index.js';

interface CoordinatedEntryRow {
  condition_id: string;
  outcome: string;
  whale_count: number;
  earliest: string;
  latest: string;
}

// Detects market/outcome pairs where 2+ tracked whales entered within a 4-hour window.
// Results are written to the anomalies table with type='coordinated_entry'.
// Stale anomalies (>48h) are pruned on each run.
export async function detectCoordinatedEntries(
  db: DbClient,
  log: Logger,
): Promise<void> {
  const childLog = log.child({ detector: 'coordinated_entry' });
  const sqlite = (db as any).$client;

  const candidates = sqlite
    .prepare(
      `SELECT
        wp.condition_id,
        wp.outcome,
        COUNT(DISTINCT wp.wallet_address) AS whale_count,
        MIN(wp.first_seen_at) AS earliest,
        MAX(wp.first_seen_at) AS latest
       FROM watched_positions wp
       JOIN wallet_stats ws ON ws.wallet_address = wp.wallet_address
       WHERE (ws.is_sharp = 1 OR ws.is_profitable = 1)
         AND wp.first_seen_at IS NOT NULL
       GROUP BY wp.condition_id, wp.outcome
       HAVING whale_count >= 2
         AND (julianday(latest) - julianday(earliest)) * 24 <= 4`,
    )
    .all() as CoordinatedEntryRow[];

  // Prune stale anomalies first
  sqlite
    .prepare(
      `DELETE FROM anomalies
       WHERE type = 'coordinated_entry'
         AND detected_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-48 hours')`,
    )
    .run();

  if (candidates.length === 0) {
    childLog.info('No coordinated entries detected');
    return;
  }

  const now = new Date().toISOString();
  let inserted = 0;

  for (const row of candidates) {
    // Skip if we already logged this combo recently (6h dedup window)
    const existing = sqlite
      .prepare(
        `SELECT id FROM anomalies
         WHERE type = 'coordinated_entry'
           AND market_id = ?
           AND json_extract(metadata, '$.outcome') = ?
           AND detected_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-6 hours')`,
      )
      .get(row.condition_id, row.outcome);

    if (existing) continue;

    const windowHours =
      row.earliest && row.latest
        ? ((new Date(row.latest).getTime() - new Date(row.earliest).getTime()) / 3_600_000).toFixed(
            1,
          )
        : null;

    const severity: string =
      row.whale_count >= 4 ? 'high' : row.whale_count >= 3 ? 'medium' : 'low';

    sqlite
      .prepare(
        `INSERT INTO anomalies (type, market_id, severity, detected_at, metadata)
         VALUES ('coordinated_entry', ?, ?, ?, ?)`,
      )
      .run(
        row.condition_id,
        severity,
        now,
        JSON.stringify({
          outcome: row.outcome,
          whale_count: row.whale_count,
          earliest_entry: row.earliest,
          latest_entry: row.latest,
          window_hours: windowHours,
        }),
      );

    inserted++;
  }

  childLog.info({ detected: candidates.length, inserted }, 'Coordinated entry detection complete');
}
