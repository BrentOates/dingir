import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServerConfig } from '../../src/client/models/ServerConfig';
import { UserProfile } from '../../src/client/models/UserProfile';
import { createTestDb } from '../helpers/db';

test('migrated :memory: database works with both models', async () => {
  const db = await createTestDb();
  try {
    const [config] = await ServerConfig.findOrCreate({ where: { serverId: 's1' } });
    await config.reload();
    assert.equal(config.systemMessagesEnabled, false);
    assert.equal(config.auditChannelId, null);
    assert.equal(config.accessFailureCount, 0);
    assert.equal(config.firstAccessFailureAt, null);

    const profile = await UserProfile.create({ serverId: 's1', userId: 'u1' });
    assert.equal(profile.activityScore, 0);

    assert.equal(await ServerConfig.count(), 1);
    assert.equal(await UserProfile.count(), 1);
  } finally {
    await db.close();
  }
});
