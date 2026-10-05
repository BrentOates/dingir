import { DataTypes, ModelAttributeColumnOptions, QueryInterface } from 'sequelize';
import type { MigrationParams } from './types';

type Columns = Record<string, ModelAttributeColumnOptions>;

const serverConfigColumns: Columns = {
  serverId: { type: DataTypes.STRING, primaryKey: true },
  prefix: { type: DataTypes.STRING, defaultValue: '^' },
  rulesMessagePath: { type: DataTypes.STRING },
  rulesMessage: { type: DataTypes.STRING },
  guestRoleIds: { type: DataTypes.STRING },
  adminRoleId: { type: DataTypes.STRING },
  welcomeMessage: { type: DataTypes.STRING },
  debug: { type: DataTypes.BOOLEAN, defaultValue: false },
  auditChannelId: { type: DataTypes.STRING },
  welcomeMessageBackgroundUrl: { type: DataTypes.STRING },
  systemMessagesEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  announcementsChannelId: { type: DataTypes.STRING },
  birthdayCalendarMessagePath: { type: DataTypes.STRING },
  honeyPotChannelId: { type: DataTypes.STRING },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false },
};

const userProfileColumns: Columns = {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  serverId: { type: DataTypes.STRING },
  userId: { type: DataTypes.STRING },
  birthdayYear: { type: DataTypes.INTEGER },
  birthdayMonth: { type: DataTypes.INTEGER },
  birthdayDay: { type: DataTypes.INTEGER },
  activityScore: { type: DataTypes.INTEGER, defaultValue: 0 },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false },
};

async function ensureTable(
  queryInterface: QueryInterface,
  table: string,
  columns: Columns
): Promise<void> {
  if (!(await queryInterface.tableExists(table))) {
    await queryInterface.createTable(table, columns);
    return;
  }

  // Tables created by the old sync() may predate some columns.
  const existing = await queryInterface.describeTable(table);
  for (const [name, definition] of Object.entries(columns)) {
    if (!(name in existing) && !definition.primaryKey && definition.allowNull !== false) {
      await queryInterface.addColumn(table, name, definition);
    }
  }
}

export async function up({ context }: MigrationParams): Promise<void> {
  await ensureTable(context, 'ServerConfigs', serverConfigColumns);
  await ensureTable(context, 'UserProfiles', userProfileColumns);
}

export async function down(): Promise<void> {
  // Intentionally a no-op: the baseline tables hold production data and are never dropped.
}
