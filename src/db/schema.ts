import { customType, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const SEQUELIZE_DATE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?) ([+-]\d{2}:\d{2})$/;

/** Formats like Sequelize did: `2024-01-01 12:00:00.000 +00:00` (always UTC). */
export const formatDate = (date: Date): string =>
  `${date.toISOString().replace('T', ' ').replace('Z', '')} +00:00`;

export const parseDate = (value: string): Date => {
  const match = SEQUELIZE_DATE.exec(value);
  return new Date(match ? `${match[1]}T${match[2]}${match[3]}` : value);
};

const datetime = customType<{ data: Date; driverData: string }>({
  dataType: () => 'DATETIME',
  toDriver: formatDate,
  fromDriver: parseDate,
});

export const serverConfigs = sqliteTable('ServerConfigs', {
  serverId: text('serverId', { length: 255 }).primaryKey(),
  guestRoleIds: text('guestRoleIds', { length: 255 }),
  welcomeMessage: text('welcomeMessage', { length: 255 }),
  debug: integer('debug', { mode: 'boolean' }).notNull().default(false),
  auditChannelId: text('auditChannelId', { length: 255 }),
  welcomeMessageBackgroundUrl: text('welcomeMessageBackgroundUrl', { length: 255 }),
  systemMessagesEnabled: integer('systemMessagesEnabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  announcementsChannelId: text('announcementsChannelId', { length: 255 }),
  birthdayCalendarMessagePath: text('birthdayCalendarMessagePath', { length: 255 }),
  honeyPotChannelId: text('honeyPotChannelId', { length: 255 }),
  accessFailureCount: integer('accessFailureCount').notNull().default(0),
  firstAccessFailureAt: datetime('firstAccessFailureAt'),
  createdAt: datetime('createdAt')
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt')
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userProfiles = sqliteTable(
  'UserProfiles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    serverId: text('serverId', { length: 255 }).notNull(),
    userId: text('userId', { length: 255 }).notNull(),
    birthdayYear: integer('birthdayYear'),
    birthdayMonth: integer('birthdayMonth'),
    birthdayDay: integer('birthdayDay'),
    activityScore: integer('activityScore').notNull().default(0),
    createdAt: datetime('createdAt')
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('user_profiles_server_user_unique').on(table.serverId, table.userId)],
);

export const botState = sqliteTable('BotState', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: datetime('updatedAt').notNull(),
});

export type ServerConfig = typeof serverConfigs.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
