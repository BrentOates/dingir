import type { Database } from 'better-sqlite3';
import type { Logger } from '../utilities/Logger.ts';
import * as baseline from './migrations/001-baseline.ts';
import * as userProfileUnique from './migrations/002-userprofile-unique.ts';
import * as serverConfigAccessTracking from './migrations/003-serverconfig-access-tracking.ts';

export interface Migration {
  name: string;
  up: (db: Database, logger: Logger) => void;
}

export const migrations: Migration[] = [
  { name: '001-baseline', up: baseline.up },
  { name: '002-userprofile-unique', up: userProfileUnique.up },
  { name: '003-serverconfig-access-tracking', up: serverConfigAccessTracking.up },
];

/** Applies pending migrations in order, each in its own transaction, and returns their names. */
export function migrate(db: Database, logger: Logger, list: Migration[] = migrations): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS `SequelizeMeta` (`name` VARCHAR(255) PRIMARY KEY)');

  const done = new Set(
    (db.prepare('SELECT name FROM `SequelizeMeta`').all() as { name: string }[]).map((r) => r.name)
  );
  const record = db.prepare('INSERT INTO `SequelizeMeta` (name) VALUES (?)');
  const applied: string[] = [];

  for (const migration of list) {
    if (done.has(migration.name)) {
      continue;
    }
    db.transaction(() => {
      migration.up(db, logger);
      record.run(migration.name);
    })();
    applied.push(migration.name);
  }

  return applied;
}
