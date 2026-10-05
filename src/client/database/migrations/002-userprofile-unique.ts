import type { Database } from 'better-sqlite3';
import { Logger } from '../../../utilities/Logger.ts';

const INDEX_NAME = 'user_profiles_server_user_unique';

interface ProfileRow {
  id: number;
  serverId: string;
  userId: string;
  birthdayYear: number | null;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  activityScore: number | null;
  updatedAt: string | null;
}

const toTime = (value: string | null): number => {
  const parsed = Date.parse(String(value ?? '').replace(' ', 'T').replace(/ ([+-])/, '$1'));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const hasBirthday = (row: ProfileRow): boolean =>
  row.birthdayMonth !== null && row.birthdayDay !== null;

const birthdayKey = (row: ProfileRow): string =>
  `${row.birthdayYear ?? ''}-${row.birthdayMonth}-${row.birthdayDay}`;

const newestFirst = (a: ProfileRow, b: ProfileRow): number =>
  toTime(b.updatedAt) - toTime(a.updatedAt) || b.id - a.id;

export function up(db: Database): void {
  const rows = db
    .prepare(
      'SELECT id, serverId, userId, birthdayYear, birthdayMonth, birthdayDay, activityScore, updatedAt FROM `UserProfiles` WHERE serverId IS NOT NULL AND userId IS NOT NULL'
    )
    .all() as ProfileRow[];

  const groups = new Map<string, ProfileRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.serverId, row.userId]);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const setScore = db.prepare('UPDATE `UserProfiles` SET activityScore = ? WHERE id = ?');
  const remove = db.prepare('DELETE FROM `UserProfiles` WHERE id = ?');

  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }

    const withBirthday = group.filter(hasBirthday).sort(newestFirst);
    const keep = withBirthday.length > 0 ? withBirthday[0] : [...group].sort(newestFirst)[0];

    if (new Set(withBirthday.map(birthdayKey)).size > 1) {
      Logger.warn('Conflicting birthdays while deduplicating UserProfiles; keeping most recent', {
        serverId: keep.serverId,
        userId: keep.userId,
        keptId: keep.id,
        birthdays: withBirthday.map((row) => ({ id: row.id, birthday: birthdayKey(row) })),
      });
    }

    setScore.run(Math.max(...group.map((row) => row.activityScore ?? 0)), keep.id);
    for (const row of group) {
      if (row.id !== keep.id) {
        remove.run(row.id);
      }
    }
  }

  db.exec(
    `CREATE UNIQUE INDEX \`${INDEX_NAME}\` ON \`UserProfiles\` (\`serverId\`, \`userId\`)`
  );
}
