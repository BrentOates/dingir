import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { createSequelize } from '../../src/client/database/createSequelize';
import { createMigrator, migrate } from '../../src/client/database/migrator';
import { ServerConfig } from '../../src/client/models/ServerConfig';
import { UserProfile } from '../../src/client/models/UserProfile';
import { Logger } from '../../src/utilities/Logger';

const INDEX = 'user_profiles_server_user_unique';
const ALL = ['001-baseline', '002-userprofile-unique', '003-serverconfig-access-tracking'];

const LEGACY_SERVER_CONFIGS =
  "CREATE TABLE `ServerConfigs` (`serverId` VARCHAR(255) PRIMARY KEY, `prefix` VARCHAR(255) DEFAULT '^', `rulesMessagePath` VARCHAR(255), `rulesMessage` VARCHAR(255), `guestRoleIds` VARCHAR(255), `adminRoleId` VARCHAR(255), `welcomeMessage` VARCHAR(255), `debug` TINYINT(1) DEFAULT 0, `auditChannelId` VARCHAR(255), `welcomeMessageBackgroundUrl` VARCHAR(255), `systemMessagesEnabled` TINYINT(1) DEFAULT 0, `announcementsChannelId` VARCHAR(255), `birthdayCalendarMessagePath` VARCHAR(255), `honeyPotChannelId` VARCHAR(255), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)";
const LEGACY_USER_PROFILES =
  'CREATE TABLE `UserProfiles` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `serverId` VARCHAR(255), `userId` VARCHAR(255), `birthdayYear` INTEGER, `birthdayMonth` INTEGER, `birthdayDay` INTEGER, `activityScore` INTEGER DEFAULT 0, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)';

const withDb = async (fn: (db: Sequelize) => Promise<void>): Promise<void> => {
  const db = createSequelize(':memory:');
  try {
    await fn(db);
  } finally {
    await db.close();
  }
};

const columnsOf = async (db: Sequelize, table: string): Promise<string[]> =>
  Object.keys(await db.getQueryInterface().describeTable(table));

const profileRow = (
  serverId: string,
  userId: string,
  month: number | null,
  day: number | null,
  score: number,
  updatedAt: string
) => ({ serverId, userId, month, day, score, updatedAt });

const insertProfiles = async (
  db: Sequelize,
  rows: ReturnType<typeof profileRow>[]
): Promise<void> => {
  for (const r of rows) {
    await db.query(
      'INSERT INTO `UserProfiles` (serverId, userId, birthdayMonth, birthdayDay, activityScore, createdAt, updatedAt) VALUES (:serverId, :userId, :month, :day, :score, :updatedAt, :updatedAt)',
      { replacements: r }
    );
  }
};

const runUpTo = async (db: Sequelize, to: string): Promise<void> => {
  await createMigrator(db).up({ to });
};

test('migrations on an empty database create the expected schema', async () => {
  await withDb(async (db) => {
    assert.deepEqual(await migrate(db), ALL);

    const serverColumns = await columnsOf(db, 'ServerConfigs');
    for (const column of [
      'serverId',
      'prefix',
      'adminRoleId',
      'guestRoleIds',
      'honeyPotChannelId',
      'accessFailureCount',
      'firstAccessFailureAt',
      'createdAt',
      'updatedAt',
    ]) {
      assert.ok(serverColumns.includes(column), `ServerConfigs.${column}`);
    }
    assert.deepEqual(await columnsOf(db, 'UserProfiles'), [
      'id',
      'serverId',
      'userId',
      'birthdayYear',
      'birthdayMonth',
      'birthdayDay',
      'activityScore',
      'createdAt',
      'updatedAt',
    ]);

    const indexes = await db.getQueryInterface().showIndex('UserProfiles');
    const unique = (indexes as { name: string; unique: boolean }[]).find((i) => i.name === INDEX);
    assert.ok(unique?.unique);

    const meta = await db.query<{ name: string }>('SELECT name FROM `SequelizeMeta` ORDER BY name', {
      type: QueryTypes.SELECT,
    });
    assert.deepEqual(
      meta.map((m) => m.name),
      ALL
    );
  });
});

test('running migrations twice is a no-op', async () => {
  await withDb(async (db) => {
    await migrate(db);
    await UserProfile.create({ serverId: 's1', userId: 'u1', activityScore: 4 });
    assert.deepEqual(await migrate(db), []);
    assert.equal(await UserProfile.count(), 1);
  });
});

test('baseline is a no-op on a legacy sync() database and later migrations preserve data', async () => {
  await withDb(async (db) => {
    await db.query(LEGACY_SERVER_CONFIGS);
    await db.query(LEGACY_USER_PROFILES);
    await db.query(
      "INSERT INTO `ServerConfigs` (serverId, prefix, adminRoleId, auditChannelId, createdAt, updatedAt) VALUES ('s1', '!', 'admin', 'chan', '2024-01-01 00:00:00.000 +00:00', '2024-01-01 00:00:00.000 +00:00')"
    );
    await insertProfiles(db, [
      profileRow('s1', 'u1', 5, 6, 3, '2024-01-01 00:00:00.000 +00:00'),
      profileRow('s1', 'u2', null, null, 9, '2024-01-01 00:00:00.000 +00:00'),
    ]);
    const before = await db.query('SELECT * FROM `UserProfiles` ORDER BY id', {
      type: QueryTypes.SELECT,
    });

    await runUpTo(db, '001-baseline');
    assert.deepEqual(
      await db.query('SELECT * FROM `UserProfiles` ORDER BY id', { type: QueryTypes.SELECT }),
      before
    );
    assert.ok(!(await columnsOf(db, 'ServerConfigs')).includes('accessFailureCount'));

    assert.deepEqual(await migrate(db), ALL.slice(1));

    const config = await ServerConfig.findByPk('s1');
    assert.equal(config?.auditChannelId, 'chan');
    assert.equal(config?.accessFailureCount, 0);
    assert.equal(config?.firstAccessFailureAt, null);
    const legacy = await db.query<{ prefix: string; adminRoleId: string }>(
      'SELECT prefix, adminRoleId FROM `ServerConfigs`',
      { type: QueryTypes.SELECT }
    );
    assert.deepEqual(legacy, [{ prefix: '!', adminRoleId: 'admin' }]);

    const profiles = await UserProfile.findAll({ order: [['id', 'ASC']] });
    assert.deepEqual(
      profiles.map((p) => [p.userId, p.birthdayMonth, p.activityScore]),
      [
        ['u1', 5, 3],
        ['u2', null, 9],
      ]
    );
  });
});

test('baseline adds missing nullable columns to an older schema', async () => {
  await withDb(async (db) => {
    await db.query(
      'CREATE TABLE `ServerConfigs` (`serverId` VARCHAR(255) PRIMARY KEY, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)'
    );
    await migrate(db);
    assert.ok((await columnsOf(db, 'ServerConfigs')).includes('honeyPotChannelId'));
    assert.ok((await columnsOf(db, 'UserProfiles')).includes('activityScore'));
  });
});

test('002 dedupes UserProfiles and enforces uniqueness afterwards', async () => {
  await withDb(async (db) => {
    await runUpTo(db, '001-baseline');
    await insertProfiles(db, [
      // a: only one has a birthday; it is older and lower score
      profileRow('s1', 'a', null, null, 10, '2024-03-01 00:00:00.000 +00:00'),
      profileRow('s1', 'a', 2, 14, 1, '2024-01-01 00:00:00.000 +00:00'),
      // b: conflicting birthdays; most recent wins
      profileRow('s1', 'b', 1, 1, 5, '2024-01-01 00:00:00.000 +00:00'),
      profileRow('s1', 'b', 7, 7, 2, '2024-02-01 00:00:00.000 +00:00'),
      profileRow('s1', 'b', null, null, 8, '2024-04-01 00:00:00.000 +00:00'),
      // c: no birthdays; most recent kept, max score
      profileRow('s1', 'c', null, null, 7, '2024-01-01 00:00:00.000 +00:00'),
      profileRow('s1', 'c', null, null, 3, '2024-02-01 00:00:00.000 +00:00'),
      // same user on another server and a unique row are untouched
      profileRow('s2', 'a', 3, 3, 1, '2024-01-01 00:00:00.000 +00:00'),
      profileRow('s1', 'd', 4, 4, 0, '2024-01-01 00:00:00.000 +00:00'),
    ]);

    const warnings: string[] = [];
    const originalWarn = Logger.warn;
    Logger.warn = (message: string) => {
      warnings.push(message);
    };
    try {
      await runUpTo(db, '002-userprofile-unique');
    } finally {
      Logger.warn = originalWarn;
    }

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Conflicting birthdays/);

    const rows = await UserProfile.findAll({ order: [['serverId', 'ASC'], ['userId', 'ASC']] });
    assert.deepEqual(
      rows.map((r) => [r.serverId, r.userId, r.birthdayMonth, r.birthdayDay, r.activityScore]),
      [
        ['s1', 'a', 2, 14, 10],
        ['s1', 'b', 7, 7, 8],
        ['s1', 'c', null, null, 7],
        ['s1', 'd', 4, 4, 0],
        ['s2', 'a', 3, 3, 1],
      ]
    );

    await assert.rejects(UserProfile.create({ serverId: 's1', userId: 'a' }));
  });
});

test('002 rolls back entirely when it fails', async () => {
  await withDb(async (db) => {
    await runUpTo(db, '001-baseline');
    await insertProfiles(db, [
      profileRow('s1', 'a', null, null, 1, '2024-01-01 00:00:00.000 +00:00'),
      profileRow('s1', 'a', null, null, 5, '2024-02-01 00:00:00.000 +00:00'),
    ]);
    await db.query('CREATE INDEX `user_profiles_server_user_unique` ON `UserProfiles` (serverId)');

    await assert.rejects(runUpTo(db, '002-userprofile-unique'));
    assert.equal(await UserProfile.count(), 2);
  });
});

test('down migrations remove the added index and columns', async () => {
  await withDb(async (db) => {
    await migrate(db);
    await createMigrator(db).down({ to: '001-baseline' });

    const columns = await columnsOf(db, 'ServerConfigs');
    assert.ok(!columns.includes('accessFailureCount'));
    assert.ok(columns.includes('serverId'));
    const indexes = (await db.getQueryInterface().showIndex('UserProfiles')) as { name: string }[];
    assert.ok(!indexes.some((i) => i.name === INDEX));
  });
});
