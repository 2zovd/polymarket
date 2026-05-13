import Database from 'better-sqlite3'
import { resolve } from 'node:path'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    // DB_PATH is set explicitly in ecosystem.config.cjs (nuxt preview changes cwd internally)
    const dbPath = process.env.DB_PATH ?? resolve(process.cwd(), '../data/polymarket.db')
    _db = new Database(dbPath, { readonly: true })
  }
  return _db
}
