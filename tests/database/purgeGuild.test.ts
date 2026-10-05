import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { count, eq } from 'drizzle-orm';
import { serverConfigs, userProfiles } from '../../src/db/schema.ts';
import { getConfig, purgeGuild } from '../../src/services/ConfigService.ts';
import { createTestApp } from '../helpers/app.ts';

const app = createTestApp();
const { db } = app;

after(() => {
  app.close();
});

beforeEach(() => {
  app.configCache.clear();
  db.delete(userProfiles).run();
  db.delete(serverConfigs).run();
  db.insert(serverConfigs).values([{ serverId: 's1' }, { serverId: 's2' }]).run();
  db.insert(userProfiles)
    .values([
      { serverId: 's1', userId: 'a' },
      { serverId: 's1', userId: 'b' },
      { serverId: 's2', userId: 'a' },
    ])
    .run();
});

const profileCount = (serverId?: string): number => {
  const query = db.select({ n: count() }).from(userProfiles);
  return (serverId ? query.where(eq(userProfiles.serverId, serverId)) : query).get()!.n;
};

const configCount = (): number => db.select({ n: count() }).from(serverConfigs).get()!.n;

test('purgeGuild deletes only the target server and reports counts', async () => {
  assert.deepEqual(await purgeGuild(app, 's1'), { config: true, profiles: 2 });

  assert.equal(db.select().from(serverConfigs).where(eq(serverConfigs.serverId, 's1')).get(), undefined);
  assert.ok(db.select().from(serverConfigs).where(eq(serverConfigs.serverId, 's2')).get());
  assert.equal(profileCount('s1'), 0);
  assert.equal(profileCount('s2'), 1);
});

test('purgeGuild on an unknown server deletes nothing', async () => {
  assert.deepEqual(await purgeGuild(app, 'nope'), { config: false, profiles: 0 });
  assert.equal(configCount(), 2);
  assert.equal(profileCount(), 3);
});

test('purgeGuild rolls back the profile delete when the config delete fails', async () => {
  db.$client.exec(
    "CREATE TRIGGER block_config_delete BEFORE DELETE ON `ServerConfigs` BEGIN SELECT RAISE(ABORT, 'boom'); END"
  );
  try {
    await assert.rejects(purgeGuild(app, 's1'), /boom/);
  } finally {
    db.$client.exec('DROP TRIGGER block_config_delete');
  }

  assert.equal(profileCount('s1'), 2);
  assert.ok(db.select().from(serverConfigs).where(eq(serverConfigs.serverId, 's1')).get());
});

test('purgeGuild drops the cached config', async () => {
  await getConfig(app, 's1');
  assert.ok(app.configCache.has('s1'));
  await purgeGuild(app, 's1');
  assert.equal(app.configCache.has('s1'), false);
});
