import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSequelize } from '../src/client/database/createSequelize';
import { ServerConfig } from '../src/client/models/ServerConfig';
import { UserProfile } from '../src/client/models/UserProfile';

test('createSequelize(":memory:") syncs both models', async () => {
  const db = createSequelize(':memory:');
  try {
    await db.sync();

    const [config] = await ServerConfig.findOrCreate({ where: { serverId: 's1' } });
    await config.reload();
    assert.equal(config.systemMessagesEnabled, false);
    assert.equal(config.auditChannelId, null);

    const profile = await UserProfile.create({ serverId: 's1', userId: 'u1' });
    assert.equal(profile.activityScore, 0);

    assert.equal(await ServerConfig.count(), 1);
    assert.equal(await UserProfile.count(), 1);
  } finally {
    await db.close();
  }
});
