import type { Database } from 'better-sqlite3';
import type { Logger } from '../../utilities/Logger.ts';

/** Brings legacy NULLs in line with the schema (activityScore and the ids are NOT NULL). */
export function up(db: Database, logger: Logger): void {
  const orphans = (
    db
      .prepare(
        'SELECT COUNT(*) AS count FROM `UserProfiles` WHERE serverId IS NULL OR userId IS NULL',
      )
      .get() as { count: number }
  ).count;
  if (orphans > 0) {
    logger.warn('Deleting UserProfiles rows with no server or user id; they cannot be read', {
      count: orphans,
    });
  }
  db.exec('UPDATE `UserProfiles` SET activityScore = 0 WHERE activityScore IS NULL');
  db.exec('DELETE FROM `UserProfiles` WHERE serverId IS NULL OR userId IS NULL');
}
