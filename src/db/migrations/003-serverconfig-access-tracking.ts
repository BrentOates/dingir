import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  const columns = new Set(
    (db.pragma('table_info(`ServerConfigs`)') as { name: string }[]).map((column) => column.name),
  );

  if (!columns.has('accessFailureCount')) {
    db.exec(
      'ALTER TABLE `ServerConfigs` ADD COLUMN `accessFailureCount` INTEGER NOT NULL DEFAULT 0',
    );
  }
  if (!columns.has('firstAccessFailureAt')) {
    db.exec('ALTER TABLE `ServerConfigs` ADD COLUMN `firstAccessFailureAt` DATETIME');
  }
}
