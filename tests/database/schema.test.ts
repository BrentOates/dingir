import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTableColumns, getTableName } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { botState, serverConfigs, userProfiles } from '../../src/db/schema.ts';
import { createTestApp } from '../helpers/app.ts';

const columnNames = (table: SQLiteTable): string[] =>
  Object.values(getTableColumns(table)).map((column) => column.name);

test('Drizzle schema columns exist in the migrated database', () => {
  const app = createTestApp();
  try {
    for (const table of [serverConfigs, userProfiles, botState]) {
      const actual = (
        app.db.$client.pragma(`table_info(\`${getTableName(table)}\`)`) as { name: string }[]
      ).map((column) => column.name);
      for (const name of columnNames(table)) {
        assert.ok(actual.includes(name), `${getTableName(table)}.${name} missing from database`);
      }
    }
  } finally {
    app.close();
  }
});

test('migrated database applies column defaults and round-trips dates', () => {
  const app = createTestApp();
  try {
    const { db } = app;
    db.insert(serverConfigs).values({ serverId: 's1' }).run();
    const config = db.select().from(serverConfigs).get()!;
    assert.equal(config.systemMessagesEnabled, false);
    assert.equal(config.auditChannelId, null);
    assert.equal(config.accessFailureCount, 0);
    assert.equal(config.firstAccessFailureAt, null);
    assert.ok(config.createdAt instanceof Date);

    const when = new Date('2024-01-01T12:00:00.000Z');
    db.update(serverConfigs).set({ firstAccessFailureAt: when }).run();
    const raw = app.db.$client.prepare('SELECT firstAccessFailureAt AS v FROM `ServerConfigs`').get() as {
      v: string;
    };
    assert.equal(raw.v, '2024-01-01 12:00:00.000 +00:00');
    assert.equal(db.select().from(serverConfigs).get()!.firstAccessFailureAt?.getTime(), when.getTime());

    db.insert(userProfiles).values({ serverId: 's1', userId: 'u1' }).run();
    assert.equal(db.select().from(userProfiles).get()!.activityScore, 0);
  } finally {
    app.close();
  }
});
