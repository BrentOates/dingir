import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { count, eq } from 'drizzle-orm';
import type { DatabaseHandle } from '../../src/db/db.ts';
import { serverConfigs, userProfiles } from '../../src/db/schema.ts';
import { ConfigService } from '../../src/services/ConfigService.ts';
import { closeTestDb, createTestDb } from '../helpers/db.ts';

let handle: DatabaseHandle;

before(() => {
  handle = createTestDb();
});

after(() => {
  closeTestDb(handle);
});

beforeEach(() => {
  const { db } = handle;
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
  const query = handle.db.select({ n: count() }).from(userProfiles);
  return (serverId ? query.where(eq(userProfiles.serverId, serverId)) : query).get()!.n;
};

const configCount = (): number => handle.db.select({ n: count() }).from(serverConfigs).get()!.n;

test('purgeGuild deletes only the target server and reports counts', async () => {
  assert.deepEqual(await ConfigService.purgeGuild('s1'), { config: true, profiles: 2 });

  assert.equal(handle.db.select().from(serverConfigs).where(eq(serverConfigs.serverId, 's1')).get(), undefined);
  assert.ok(handle.db.select().from(serverConfigs).where(eq(serverConfigs.serverId, 's2')).get());
  assert.equal(profileCount('s1'), 0);
  assert.equal(profileCount('s2'), 1);
});

test('purgeGuild on an unknown server deletes nothing', async () => {
  assert.deepEqual(await ConfigService.purgeGuild('nope', handle.db), { config: false, profiles: 0 });
  assert.equal(configCount(), 2);
  assert.equal(profileCount(), 3);
});

test('purgeGuild rolls back the profile delete when the config delete fails', async () => {
  handle.sqlite.exec(
    "CREATE TRIGGER block_config_delete BEFORE DELETE ON `ServerConfigs` BEGIN SELECT RAISE(ABORT, 'boom'); END"
  );
  try {
    await assert.rejects(ConfigService.purgeGuild('s1'), /boom/);
  } finally {
    handle.sqlite.exec('DROP TRIGGER block_config_delete');
  }

  assert.equal(profileCount('s1'), 2);
  assert.ok(handle.db.select().from(serverConfigs).where(eq(serverConfigs.serverId, 's1')).get());
});
