import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { env } from '../../config/env.ts';
import * as schema from './schema.ts';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  sqlite: Database.Database;
  db: AppDatabase;
}

export function createDatabase(path: string): DatabaseHandle {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

let current: DatabaseHandle | undefined;

/** The shared database; opened lazily from env.dbPath unless a test installed one. */
export function getDatabase(): DatabaseHandle {
  current ??= createDatabase(env.dbPath);
  return current;
}

export const getDb = (): AppDatabase => getDatabase().db;

/** Test seam: point the services at another database. */
export function setDatabase(handle: DatabaseHandle | undefined): void {
  current = handle;
}
