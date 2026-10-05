import type { Database } from 'better-sqlite3';

type Columns = Record<string, string>;

const serverConfigColumns: Columns = {
  serverId: 'VARCHAR(255) PRIMARY KEY',
  prefix: "VARCHAR(255) DEFAULT '^'",
  rulesMessagePath: 'VARCHAR(255)',
  rulesMessage: 'VARCHAR(255)',
  guestRoleIds: 'VARCHAR(255)',
  adminRoleId: 'VARCHAR(255)',
  welcomeMessage: 'VARCHAR(255)',
  debug: 'TINYINT(1) DEFAULT 0',
  auditChannelId: 'VARCHAR(255)',
  welcomeMessageBackgroundUrl: 'VARCHAR(255)',
  systemMessagesEnabled: 'TINYINT(1) DEFAULT 0',
  announcementsChannelId: 'VARCHAR(255)',
  birthdayCalendarMessagePath: 'VARCHAR(255)',
  honeyPotChannelId: 'VARCHAR(255)',
  createdAt: 'DATETIME NOT NULL',
  updatedAt: 'DATETIME NOT NULL',
};

const userProfileColumns: Columns = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  serverId: 'VARCHAR(255)',
  userId: 'VARCHAR(255)',
  birthdayYear: 'INTEGER',
  birthdayMonth: 'INTEGER',
  birthdayDay: 'INTEGER',
  activityScore: 'INTEGER DEFAULT 0',
  createdAt: 'DATETIME NOT NULL',
  updatedAt: 'DATETIME NOT NULL',
};

function ensureTable(db: Database, table: string, columns: Columns): void {
  const existing = db.pragma(`table_info(\`${table}\`)`) as { name: string }[];
  if (existing.length === 0) {
    const definitions = Object.entries(columns).map(([name, type]) => `\`${name}\` ${type}`);
    db.exec(`CREATE TABLE \`${table}\` (${definitions.join(', ')})`);
    return;
  }

  // Tables created by the old sync() may predate some columns.
  const present = new Set(existing.map((column) => column.name));
  for (const [name, type] of Object.entries(columns)) {
    if (!present.has(name) && !/PRIMARY KEY|NOT NULL/.test(type)) {
      db.exec(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${type}`);
    }
  }
}

export function up(db: Database): void {
  ensureTable(db, 'ServerConfigs', serverConfigColumns);
  ensureTable(db, 'UserProfiles', userProfileColumns);
}
