import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type DbClient = ReturnType<typeof createDb>;

export function createDb(databasePath: string) {
  // Ensure the directory exists (e.g. data/ on first run)
  mkdirSync(dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);

  // WAL mode: concurrent reads don't block writes; safe for single-writer bots
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  return drizzle(sqlite, { schema });
}
