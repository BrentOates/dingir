import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { Sequelize } from 'sequelize-typescript';
import { ServerConfig } from '../../src/client/models/ServerConfig';
import { UserProfile } from '../../src/client/models/UserProfile';
import { ConfigService } from '../../src/utilities/ConfigService';
import { createTestDb } from '../helpers/db';

let db: Sequelize;

before(async () => {
  db = await createTestDb();
});

after(async () => {
  await db.close();
});

beforeEach(async () => {
  await UserProfile.destroy({ where: {} });
  await ServerConfig.destroy({ where: {} });
  await ServerConfig.bulkCreate([{ serverId: 's1' }, { serverId: 's2' }]);
  await UserProfile.bulkCreate([
    { serverId: 's1', userId: 'a' },
    { serverId: 's1', userId: 'b' },
    { serverId: 's2', userId: 'a' },
  ]);
});

test('purgeGuild deletes only the target server and reports counts', async () => {
  assert.deepEqual(await ConfigService.purgeGuild('s1'), { config: true, profiles: 2 });

  assert.equal(await ServerConfig.findByPk('s1'), null);
  assert.ok(await ServerConfig.findByPk('s2'));
  assert.equal(await UserProfile.count({ where: { serverId: 's1' } }), 0);
  assert.equal(await UserProfile.count({ where: { serverId: 's2' } }), 1);
});

test('purgeGuild on an unknown server deletes nothing', async () => {
  assert.deepEqual(await ConfigService.purgeGuild('nope', db), { config: false, profiles: 0 });
  assert.equal(await ServerConfig.count(), 2);
  assert.equal(await UserProfile.count(), 3);
});

test('purgeGuild rolls back the profile delete when the config delete fails', async () => {
  const original = ServerConfig.destroy;
  ServerConfig.destroy = (() => Promise.reject(new Error('boom'))) as typeof ServerConfig.destroy;
  try {
    await assert.rejects(ConfigService.purgeGuild('s1'), /boom/);
  } finally {
    ServerConfig.destroy = original;
  }

  assert.equal(await UserProfile.count({ where: { serverId: 's1' } }), 2);
  assert.ok(await ServerConfig.findByPk('s1'));
});
