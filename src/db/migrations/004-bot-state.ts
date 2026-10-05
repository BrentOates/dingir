import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS `BotState` (`key` TEXT PRIMARY KEY, `value` TEXT NOT NULL, `updatedAt` DATETIME NOT NULL)'
  );
}
