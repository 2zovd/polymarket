import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type DbClient = ReturnType<typeof createDb>;

function runMigrations(sqlite: InstanceType<typeof Database>): void {
  const wpCols = (sqlite.pragma('table_info(watched_positions)') as Array<{ name: string }>).map(
    (c) => c.name,
  );
  if (!wpCols.includes('first_seen_at')) {
    sqlite.exec('ALTER TABLE watched_positions ADD COLUMN first_seen_at TEXT');
  }

  const wsCols = (sqlite.pragma('table_info(wallet_stats)') as Array<{ name: string }>).map(
    (c) => c.name,
  );
  if (!wsCols.includes('avg_position_size_usdc')) {
    sqlite.exec('ALTER TABLE wallet_stats ADD COLUMN avg_position_size_usdc REAL');
  }

  const mCols = (sqlite.pragma('table_info(markets)') as Array<{ name: string }>).map(
    (c) => c.name,
  );
  if (!mCols.includes('event_slug')) {
    sqlite.exec('ALTER TABLE markets ADD COLUMN event_slug TEXT');
  }
  if (!mCols.includes('accepting_orders')) {
    sqlite.exec('ALTER TABLE markets ADD COLUMN accepting_orders INTEGER NOT NULL DEFAULT 1');
  }

  // Partial unique index: prevent double-entry into the same token while a position is open.
  // Uses SQLite partial index (WHERE status = 'open') so resolved positions don't block re-entry
  // if the same market ever reopens or a new position is taken after resolution.
  const indexes = (
    sqlite.pragma('index_list(open_positions)') as Array<{ name: string }>
  ).map((i) => i.name);
  if (!indexes.includes('open_positions_token_id_open_unique')) {
    // Remove duplicate open entries before creating the unique index — keep only the row
    // with the highest id (most recent) per token_id to preserve the latest signal linkage.
    sqlite.exec(
      `DELETE FROM open_positions
       WHERE status = 'open'
         AND id NOT IN (
           SELECT MAX(id) FROM open_positions WHERE status = 'open' GROUP BY token_id
         )`,
    );
    sqlite.exec(
      `CREATE UNIQUE INDEX open_positions_token_id_open_unique
       ON open_positions(token_id) WHERE status = 'open'`,
    );
  }
}

export function createDb(databasePath: string) {
  // Ensure the directory exists (e.g. data/ on first run)
  mkdirSync(dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);

  // WAL mode: concurrent reads don't block writes; safe for single-writer bots
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  runMigrations(sqlite);

  return drizzle(sqlite, { schema });
}
