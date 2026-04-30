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
