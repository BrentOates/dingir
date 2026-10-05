import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { DatabaseHandle } from '../../src/db/db.ts';
import { ConfigService } from '../../src/services/ConfigService.ts';
import { UserProfileService } from '../../src/services/UserProfileService.ts';
import {
  allProfiles,
  clearConfigs,
  clearProfiles,
  closeTestDb,
  createTestDb,
} from '../helpers/db.ts';

let db: DatabaseHandle;

before(() => {
  db = createTestDb();
});

after(() => {
  closeTestDb(db);
});

beforeEach(() => {
  clearProfiles();
  clearConfigs();
});

test('getConfig creates the row once and returns the same one afterwards', async () => {
  const first = await ConfigService.getConfig('s1');
  const second = await ConfigService.getConfig('s1');
  assert.equal((await ConfigService.getConfigs()).length, 1);
  assert.equal(first.createdAt.getTime(), second.createdAt.getTime());
  assert.equal(first.debug, false);
});

test('updateConfig patches fields, bumps updatedAt and creates a missing row', async () => {
  const created = await ConfigService.updateConfig('s1', { auditChannelId: 'c1' });
  assert.equal(created.auditChannelId, 'c1');

  const updated = await ConfigService.updateConfig('s1', { debug: true, auditChannelId: null });
  assert.equal(updated.debug, true);
  assert.equal(updated.auditChannelId, null);
  assert.ok(updated.updatedAt.getTime() >= created.updatedAt.getTime());
  assert.equal((await ConfigService.getConfig('s1')).debug, true);
});

test('incrementActivityScore upserts and increments atomically', async () => {
  await UserProfileService.incrementActivityScore('s1', 'u1');
  await UserProfileService.incrementActivityScore('s1', 'u1');
  await UserProfileService.incrementActivityScore('s1', 'u2');
  const scores = allProfiles().map((p) => [p.userId, p.activityScore]);
  assert.deepEqual(scores, [
    ['u1', 2],
    ['u2', 1],
  ]);
});

test('setBirthday upserts without losing the activity score; clearBirthday reports presence', async () => {
  await UserProfileService.incrementActivityScore('s1', 'u1');
  await UserProfileService.setBirthday('s1', 'u1', 3, 4);
  await UserProfileService.setBirthday('s1', 'u1', 5, 6);
  const [profile] = allProfiles();
  assert.deepEqual([profile.birthdayMonth, profile.birthdayDay, profile.activityScore], [5, 6, 1]);
  assert.equal(allProfiles().length, 1);

  assert.equal(await UserProfileService.clearBirthday('s1', 'u1'), true);
  assert.equal(await UserProfileService.clearBirthday('s1', 'nobody'), false);
  assert.equal((await UserProfileService.getServerBirthdays('s1')).length, 0);
});
