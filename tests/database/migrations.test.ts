import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { migrate, migrations, type Migration } from '../../src/client/database/migrator.ts';
import { Logger } from '../../src/utilities/Logger.ts';

type Db = Database.Database;

const INDEX = 'user_profiles_server_user_unique';
const ALL = ['001-baseline', '002-userprofile-unique', '003-serverconfig-access-tracking'];

const LEGACY_SERVER_CONFIGS =
  "CREATE TABLE `ServerConfigs` (`serverId` VARCHAR(255) PRIMARY KEY, `prefix` VARCHAR(255) DEFAULT '^', `rulesMessagePath` VARCHAR(255), `rulesMessage` VARCHAR(255), `guestRoleIds` VARCHAR(255), `adminRoleId` VARCHAR(255), `welcomeMessage` VARCHAR(255), `debug` TINYINT(1) DEFAULT 0, `auditChannelId` VARCHAR(255), `welcomeMessageBackgroundUrl` VARCHAR(255), `systemMessagesEnabled` TINYINT(1) DEFAULT 0, `announcementsChannelId` VARCHAR(255), `birthdayCalendarMessagePath` VARCHAR(255), `honeyPotChannelId` VARCHAR(255), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)";
const LEGACY_USER_PROFILES =
  'CREATE TABLE `UserProfiles` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `serverId` VARCHAR(255), `userId` VARCHAR(255), `birthdayYear` INTEGER, `birthdayMonth` INTEGER, `birthdayDay` INTEGER, `activityScore` INTEGER DEFAULT 0, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)';

const withDb = (fn: (db: Db) => void): void => {
  const db = new Database(':memory:');
  try {
    fn(db);
  } finally {
    db.close();
  }
};

const columnsOf = (db: Db, table: string): string[] =>
  (db.pragma(`table_info(\`${table}\`)`) as { name: string }[]).map((c) => c.name);

const indexesOf = (db: Db, table: string): { name: string; unique: number }[] =>
  db.pragma(`index_list(\`${table}\`)`) as { name: string; unique: number }[];

const profileRow = (
  serverId: string,
  userId: string,
  month: number | null,
  day: number | null,
  score: number,
  updatedAt: string
) => ({ serverId, userId, month, day, score, updatedAt });

const insertProfiles = (db: Db, rows: ReturnType<typeof profileRow>[]): void => {
  const insert = db.prepare(
    'INSERT INTO `UserProfiles` (serverId, userId, birthdayMonth, birthdayDay, activityScore, createdAt, updatedAt) VALUES (@serverId, @userId, @month, @day, @score, @updatedAt, @updatedAt)'
  );
  for (const r of rows) {
    insert.run(r);
  }
};

const runUpTo = (db: Db, to: string): string[] =>
  migrate(db, migrations.slice(0, migrations.findIndex((m) => m.name === to) + 1));

const allRows = (db: Db, sql: string): unknown[] => db.prepare(sql).all();

test('migrations on an empty database create the expected schema', () => {
  withDb((db) => {
    assert.deepEqual(migrate(db), ALL);

    const serverColumns = columnsOf(db, 'ServerConfigs');
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
    assert.deepEqual(columnsOf(db, 'UserProfiles'), [
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

    assert.ok(indexesOf(db, 'UserProfiles').find((i) => i.name === INDEX)?.unique);

    const meta = allRows(db, 'SELECT name FROM `SequelizeMeta` ORDER BY name') as { name: string }[];
    assert.deepEqual(
      meta.map((m) => m.name),
      ALL
    );
  });
});

test('running migrations twice is a no-op', () => {
  withDb((db) => {
    migrate(db);
    insertProfiles(db, [profileRow('s1', 'u1', null, null, 4, '2024-01-01 00:00:00.000 +00:00')]);
    assert.deepEqual(migrate(db), []);
    assert.equal(allRows(db, 'SELECT * FROM `UserProfiles`').length, 1);
  });
});

test('baseline is a no-op on a legacy sync() database and later migrations preserve data', () => {
  withDb((db) => {
    db.exec(LEGACY_SERVER_CONFIGS);
    db.exec(LEGACY_USER_PROFILES);
    db.exec(
      "INSERT INTO `ServerConfigs` (serverId, prefix, adminRoleId, auditChannelId, createdAt, updatedAt) VALUES ('s1', '!', 'admin', 'chan', '2024-01-01 00:00:00.000 +00:00', '2024-01-01 00:00:00.000 +00:00')"
    );
    insertProfiles(db, [
      profileRow('s1', 'u1', 5, 6, 3, '2024-01-01 00:00:00.000 +00:00'),
      profileRow('s1', 'u2', null, null, 9, '2024-01-01 00:00:00.000 +00:00'),
    ]);
    const before = allRows(db, 'SELECT * FROM `UserProfiles` ORDER BY id');

    assert.deepEqual(runUpTo(db, '001-baseline'), ['001-baseline']);
    assert.deepEqual(allRows(db, 'SELECT * FROM `UserProfiles` ORDER BY id'), before);
    assert.ok(!columnsOf(db, 'ServerConfigs').includes('accessFailureCount'));

    assert.deepEqual(migrate(db), ALL.slice(1));

    const config = db.prepare('SELECT * FROM `ServerConfigs` WHERE serverId = ?').get('s1') as Record<
      string,
      unknown
    >;
    assert.equal(config.auditChannelId, 'chan');
    assert.equal(config.accessFailureCount, 0);
    assert.equal(config.firstAccessFailureAt, null);
    assert.deepEqual(allRows(db, 'SELECT prefix, adminRoleId FROM `ServerConfigs`'), [
      { prefix: '!', adminRoleId: 'admin' },
    ]);

    const profiles = allRows(
      db,
      'SELECT userId, birthdayMonth, activityScore FROM `UserProfiles` ORDER BY id'
    );
    assert.deepEqual(profiles, [
      { userId: 'u1', birthdayMonth: 5, activityScore: 3 },
      { userId: 'u2', birthdayMonth: null, activityScore: 9 },
    ]);
  });
});

test('a database already migrated by the previous umzug setup runs nothing and keeps its data', () => {
  withDb((db) => {
    migrate(db);
    insertProfiles(db, [profileRow('s1', 'u1', 5, 6, 3, '2024-01-01 00:00:00.000 +00:00')]);
    db.exec(
      "INSERT INTO `ServerConfigs` (serverId, accessFailureCount, createdAt, updatedAt) VALUES ('s1', 2, '2024-01-01 00:00:00.000 +00:00', '2024-01-01 00:00:00.000 +00:00')"
    );

    const ran: string[] = [];
    const spies: Migration[] = migrations.map((m) => ({
      name: m.name,
      up: () => {
        ran.push(m.name);
      },
    }));

    assert.deepEqual(migrate(db, spies), []);
    assert.deepEqual(ran, []);
    assert.deepEqual(allRows(db, 'SELECT userId, activityScore FROM `UserProfiles`'), [
      { userId: 'u1', activityScore: 3 },
    ]);
    assert.deepEqual(allRows(db, 'SELECT serverId, accessFailureCount FROM `ServerConfigs`'), [
      { serverId: 's1', accessFailureCount: 2 },
    ]);
  });
});

test('baseline adds missing nullable columns to an older schema', () => {
  withDb((db) => {
    db.exec(
      'CREATE TABLE `ServerConfigs` (`serverId` VARCHAR(255) PRIMARY KEY, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)'
    );
    migrate(db);
    assert.ok(columnsOf(db, 'ServerConfigs').includes('honeyPotChannelId'));
    assert.ok(columnsOf(db, 'UserProfiles').includes('activityScore'));
  });
});

test('002 dedupes UserProfiles and enforces uniqueness afterwards', () => {
  withDb((db) => {
    runUpTo(db, '001-baseline');
    insertProfiles(db, [
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
      runUpTo(db, '002-userprofile-unique');
    } finally {
      Logger.warn = originalWarn;
    }

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Conflicting birthdays/);

    const rows = db
      .prepare(
        'SELECT serverId, userId, birthdayMonth, birthdayDay, activityScore FROM `UserProfiles` ORDER BY serverId, userId'
      )
      .raw()
      .all();
    assert.deepEqual(rows, [
      ['s1', 'a', 2, 14, 10],
      ['s1', 'b', 7, 7, 8],
      ['s1', 'c', null, null, 7],
      ['s1', 'd', 4, 4, 0],
      ['s2', 'a', 3, 3, 1],
    ]);

    assert.throws(() =>
      insertProfiles(db, [profileRow('s1', 'a', null, null, 0, '2024-05-01 00:00:00.000 +00:00')])
    );
  });
});

test('002 rolls back entirely when it fails', () => {
  withDb((db) => {
    runUpTo(db, '001-baseline');
    insertProfiles(db, [
      profileRow('s1', 'a', null, null, 1, '2024-01-01 00:00:00.000 +00:00'),
      profileRow('s1', 'a', null, null, 5, '2024-02-01 00:00:00.000 +00:00'),
    ]);
    db.exec('CREATE INDEX `user_profiles_server_user_unique` ON `UserProfiles` (serverId)');

    assert.throws(() => runUpTo(db, '002-userprofile-unique'));
    assert.equal(allRows(db, 'SELECT * FROM `UserProfiles`').length, 2);
    assert.deepEqual(allRows(db, 'SELECT name FROM `SequelizeMeta`'), [{ name: '001-baseline' }]);
  });
});
