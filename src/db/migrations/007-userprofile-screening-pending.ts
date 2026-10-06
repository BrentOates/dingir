import type { Database } from 'better-sqlite3';

/** Records when a member was seen pending membership screening, so onboarding never relies on inference. */
export function up(db: Database): void {
  const columns = new Set(
    (db.pragma('table_info(`UserProfiles`)') as { name: string }[]).map((column) => column.name),
  );
  if (!columns.has('screeningPendingAt')) {
    db.exec('ALTER TABLE `UserProfiles` ADD COLUMN `screeningPendingAt` DATETIME');
  }
}
