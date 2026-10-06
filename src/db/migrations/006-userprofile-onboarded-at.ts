import type { Database } from 'better-sqlite3';

/** Records when a member's onboarding was last run so replayed gateway events stay idempotent. */
export function up(db: Database): void {
  const columns = new Set(
    (db.pragma('table_info(`UserProfiles`)') as { name: string }[]).map((column) => column.name),
  );
  if (!columns.has('onboardedAt')) {
    db.exec('ALTER TABLE `UserProfiles` ADD COLUMN `onboardedAt` DATETIME');
  }
}
