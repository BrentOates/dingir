import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { getConfig, getConfigs, updateConfig } from '../../src/services/ConfigService.ts';
import {
  clearBirthday,
  getServerBirthdays,
  incrementActivityScore,
  setBirthday,
} from '../../src/services/UserProfileService.ts';
import { createTestApp } from '../helpers/app.ts';
import { dbFixtures } from '../helpers/db.ts';

const app = createTestApp();
const { db } = app;
const { allProfiles, clearConfigs, clearProfiles } = dbFixtures(db);

after(() => {
  app.close();
});

beforeEach(() => {
  clearProfiles();
  clearConfigs();
});

test('getConfig creates the row once and returns the same one afterwards', async () => {
  const first = await getConfig(db, 's1');
  const second = await getConfig(db, 's1');
  assert.equal((await getConfigs(db)).length, 1);
  assert.equal(first.createdAt.getTime(), second.createdAt.getTime());
  assert.equal(first.debug, false);
});

test('updateConfig patches fields, bumps updatedAt and creates a missing row', async () => {
  const created = await updateConfig(db, 's1', { auditChannelId: 'c1' });
  assert.equal(created.auditChannelId, 'c1');

  const updated = await updateConfig(db, 's1', { debug: true, auditChannelId: null });
  assert.equal(updated.debug, true);
  assert.equal(updated.auditChannelId, null);
  assert.ok(updated.updatedAt.getTime() >= created.updatedAt.getTime());
  assert.equal((await getConfig(db, 's1')).debug, true);
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
  const [profile] = allProfiles();
  assert.deepEqual([profile.birthdayMonth, profile.birthdayDay, profile.activityScore], [5, 6, 1]);
  assert.equal(allProfiles().length, 1);

  assert.equal(await clearBirthday(db, 's1', 'u1'), true);
  assert.equal(await clearBirthday(db, 's1', 'nobody'), false);
  assert.equal((await getServerBirthdays(db, 's1')).length, 0);
});
