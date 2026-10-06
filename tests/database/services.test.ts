import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import {
  deleteConfig,
  getConfig,
  getConfigs,
  resetAccessFailures,
  updateConfig,
  updateExistingConfig,
} from '../../src/services/ConfigService.ts';
import {
  clearBirthday,
  getServerBirthdays,
  incrementActivityScore,
  setBirthday,
} from '../../src/services/UserProfileService.ts';
import { eq } from 'drizzle-orm';
import { serverConfigs, type ServerConfig } from '../../src/db/schema.ts';
import { createTestApp } from '../helpers/app.ts';
import { nth } from '../helpers/assertions.ts';
import { dbFixtures } from '../helpers/db.ts';

const app = createTestApp();
const { db } = app;
const { allProfiles, clearConfigs, clearProfiles } = dbFixtures(app);

after(() => {
  app.close();
});

beforeEach(() => {
  app.configCache.clear();
  clearProfiles();
  clearConfigs();
});

test('getConfig creates the row once and returns the same one afterwards', async () => {
  const first = await getConfig(app, 's1');
  const second = await getConfig(app, 's1');
  assert.equal((await getConfigs(db)).length, 1);
  assert.equal(first.createdAt.getTime(), second.createdAt.getTime());
  assert.equal(first.debug, false);
});

test('updateConfig patches fields, bumps updatedAt and creates a missing row', async () => {
  const created = await updateConfig(app, 's1', { auditChannelId: 'c1' });
  assert.equal(created.auditChannelId, 'c1');

  const updated = await updateConfig(app, 's1', { debug: true, auditChannelId: null });
  assert.equal(updated.debug, true);
  assert.equal(updated.auditChannelId, null);
  assert.ok(updated.updatedAt.getTime() >= created.updatedAt.getTime());
  assert.equal((await getConfig(app, 's1')).debug, true);
});

const countSelects = (): { count: () => number; restore: () => void } => {
  const select = db.select.bind(db);
  let calls = 0;
  db.select = ((...args: Parameters<typeof select>) => {
    calls += 1;
    return select(...args);
  }) as typeof db.select;
  return {
    count: () => calls,
    restore: () => {
      db.select = select as typeof db.select;
    },
  };
};

test('getConfig serves repeat lookups from the cache without touching the database', async () => {
  const spy = countSelects();
  try {
    const first = await getConfig(app, 's1');
    assert.equal(spy.count(), 1);
    assert.equal(await getConfig(app, 's1'), first);
    assert.equal(spy.count(), 1);
  } finally {
    spy.restore();
  }
});

test('updateConfig refreshes the cached config', async () => {
  await getConfig(app, 's1');
  const updated = await updateConfig(app, 's1', { debug: true });
  const spy = countSelects();
  try {
    assert.equal(await getConfig(app, 's1'), updated);
    assert.equal(spy.count(), 0);
  } finally {
    spy.restore();
  }
  assert.equal((await getConfig(app, 's1')).debug, true);
});

test('resetAccessFailures updates the cache', async () => {
  const config = await updateConfig(app, 's1', {
    accessFailureCount: 2,
    firstAccessFailureAt: new Date(),
  });
  const reset = await resetAccessFailures(app, config);
  assert.equal(reset.accessFailureCount, 0);
  assert.equal((await getConfig(app, 's1')).accessFailureCount, 0);
});

test('deleteConfig invalidates the cache so the next lookup recreates defaults', async () => {
  await updateConfig(app, 's1', { debug: true });
  assert.equal(await deleteConfig(app, 's1'), true);
  assert.equal(app.configCache.has('s1'), false);
  assert.equal((await getConfig(app, 's1')).debug, false);
});

test('incrementActivityScore upserts and increments atomically', async () => {
  await incrementActivityScore(db, 's1', 'u1');
  await incrementActivityScore(db, 's1', 'u1');
  await incrementActivityScore(db, 's1', 'u2');
  const scores = allProfiles().map((p) => [p.userId, p.activityScore]);
  assert.deepEqual(scores, [
    ['u1', 2],
    ['u2', 1],
  ]);
});

test('setBirthday upserts without losing the activity score; clearBirthday reports presence', async () => {
  await incrementActivityScore(db, 's1', 'u1');
  await setBirthday(db, 's1', 'u1', 3, 4);
  await setBirthday(db, 's1', 'u1', 5, 6);
  const profile = nth(allProfiles());
  assert.deepEqual([profile.birthdayMonth, profile.birthdayDay, profile.activityScore], [5, 6, 1]);
  assert.equal(allProfiles().length, 1);

  assert.equal(await clearBirthday(db, 's1', 'u1'), true);
  assert.equal(await clearBirthday(db, 's1', 'u1'), false);
  assert.equal(await clearBirthday(db, 's1', 'nobody'), false);
  assert.equal((await getServerBirthdays(db, 's1')).length, 0);
});

test('updateExistingConfig patches an existing row but never creates one', async () => {
  await updateConfig(app, 's-existing', { debug: false });
  const patched = await updateExistingConfig(app, 's-existing', { debug: true });
  assert.equal(patched?.debug, true);
  assert.equal(app.configCache.get('s-existing')?.debug, true);

  app.configCache.set('s-gone', { serverId: 's-gone' } as ServerConfig);
  assert.equal(await updateExistingConfig(app, 's-gone', { debug: true }), null);
  assert.equal(app.configCache.has('s-gone'), false);
  assert.equal(
    app.db.select().from(serverConfigs).where(eq(serverConfigs.serverId, 's-gone')).get(),
    undefined,
  );
});
