import { QueryTypes } from 'sequelize';
import { Logger } from '../../../utilities/Logger';
import type { MigrationParams } from './types';

const INDEX_NAME = 'user_profiles_server_user_unique';

interface ProfileRow {
  id: number;
  serverId: string;
  userId: string;
  birthdayYear: number | null;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  activityScore: number | null;
  updatedAt: string | Date | null;
}

const toTime = (value: string | Date | null): number => {
  if (value instanceof Date) {
    return value.getTime();
  }
  const parsed = Date.parse(String(value ?? '').replace(' ', 'T').replace(/ ([+-])/, '$1'));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const hasBirthday = (row: ProfileRow): boolean =>
  row.birthdayMonth !== null && row.birthdayDay !== null;

const birthdayKey = (row: ProfileRow): string =>
  `${row.birthdayYear ?? ''}-${row.birthdayMonth}-${row.birthdayDay}`;

const newestFirst = (a: ProfileRow, b: ProfileRow): number =>
  toTime(b.updatedAt) - toTime(a.updatedAt) || b.id - a.id;

export async function up({ context }: MigrationParams): Promise<void> {
  const sequelize = context.sequelize;

  await sequelize.transaction(async (transaction) => {
    const rows = await sequelize.query<ProfileRow>(
      'SELECT id, serverId, userId, birthdayYear, birthdayMonth, birthdayDay, activityScore, updatedAt FROM `UserProfiles` WHERE serverId IS NOT NULL AND userId IS NOT NULL',
      { type: QueryTypes.SELECT, transaction }
    );

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

      const maxScore = Math.max(...group.map((row) => row.activityScore ?? 0));
      const removeIds = group.filter((row) => row.id !== keep.id).map((row) => row.id);

      await sequelize.query('UPDATE `UserProfiles` SET activityScore = :maxScore WHERE id = :id', {
        replacements: { maxScore, id: keep.id },
        transaction,
      });
      await sequelize.query('DELETE FROM `UserProfiles` WHERE id IN (:removeIds)', {
        replacements: { removeIds },
        transaction,
      });
    }

    await context.addIndex('UserProfiles', ['serverId', 'userId'], {
      name: INDEX_NAME,
      unique: true,
      transaction,
    });
  });
}

export async function down({ context }: MigrationParams): Promise<void> {
  await context.removeIndex('UserProfiles', INDEX_NAME);
}
