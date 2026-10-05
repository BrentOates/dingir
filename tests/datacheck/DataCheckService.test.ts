import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { DatabaseHandle } from '../../src/db/db.ts';
import type { ServerConfig } from '../../src/db/schema.ts';
import { run } from '../../src/services/DataCheckService.ts';
import { apiError, fakeClient, fakeGuildWithMembers } from '../fakes/guild.ts';
import { clearConfigs, clearProfiles, closeTestDb, allProfiles, countProfiles, createConfig, createConfigs, createProfiles, createTestDb, findConfig } from '../helpers/db.ts';

console.warn = (): void => undefined;
console.error = (): void => undefined;
console.log = (): void => undefined;

const policy = { minFailures: 3, graceDays: 7 };
const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date('2027-01-01T00:00:00Z');

let db: DatabaseHandle;

before(async () => {
  db = createTestDb();
});

after(async () => {
  closeTestDb(db);
});

beforeEach(async () => {
  clearProfiles();
  clearConfigs();
});

const reload = (id: string): ServerConfig | null => findConfig(id);

test('transient errors never purge or change counters', async () => {
  await createConfig({ serverId: 'g1', accessFailureCount: 5, firstAccessFailureAt: t0 });
  await createProfiles([{ serverId: 'g1', userId: 'a' }]);
  const client = fakeClient({ guilds: { g1: apiError(500) } });
  await run(client, new Date(t0.getTime() + 30 * DAY), policy);
  const config = await reload('g1');
  assert.equal(config?.accessFailureCount, 5);
  assert.equal(await countProfiles(), 1);
});

test('gone guild is purged only after min failures and grace period', async () => {
  await createConfig({ serverId: 'g1' });
  await createProfiles([{ serverId: 'g1', userId: 'a' }]);
  const client = fakeClient({ guilds: { g1: apiError(50001) } });

  await run(client, t0, policy);
  await run(client, new Date(t0.getTime() + 3 * DAY), policy);
  await run(client, new Date(t0.getTime() + 6 * DAY), policy);
  const config = await reload('g1');
  assert.equal(config?.accessFailureCount, 3);
  assert.equal(await countProfiles(), 1);

  await run(client, new Date(t0.getTime() + 7 * DAY), policy);
  assert.equal(await reload('g1'), null);
  assert.equal(await countProfiles(), 0);
});

test('guild missing from the client entirely counts as gone', async () => {
  await createConfig({ serverId: 'g1' });
  await run(fakeClient(), t0, policy);
  assert.equal((await reload('g1'))?.accessFailureCount, 1);
});

test('a successful fetch resets counters', async () => {
  await createConfig({ serverId: 'g1', accessFailureCount: 2, firstAccessFailureAt: t0 });
  const guild = fakeGuildWithMembers({ id: 'g1', memberIds: ['a'] });
  await run(fakeClient({ guilds: { g1: guild } }), new Date(t0.getTime() + DAY), policy);
  const config = await reload('g1');
  assert.equal(config?.accessFailureCount, 0);
  assert.equal(config?.firstAccessFailureAt, null);
});

test('profiles of departed members are deleted, including non-birthday ones', async () => {
  await createConfig({ serverId: 'g1' });
  await createProfiles([
    { serverId: 'g1', userId: 'here' },
    { serverId: 'g1', userId: 'gone-plain' },
    { serverId: 'g1', userId: 'gone-bday', birthdayMonth: 1, birthdayDay: 1 },
    { serverId: 'other', userId: 'gone-plain' },
  ]);
  const guild = fakeGuildWithMembers({ id: 'g1', memberIds: ['here'] });
  await run(fakeClient({ guilds: { g1: guild } }), t0, policy);
  const remaining = (await allProfiles()).map((p) => `${p.serverId}/${p.userId}`).sort();
  assert.deepEqual(remaining, ['g1/here', 'other/gone-plain']);
});

test('an empty member list does not wipe profiles', async () => {
  await createConfig({ serverId: 'g1' });
  await createProfiles([{ serverId: 'g1', userId: 'a' }]);
  const guild = fakeGuildWithMembers({ id: 'g1', memberIds: [] });
  await run(fakeClient({ guilds: { g1: guild } }), t0, policy);
  assert.equal(await countProfiles(), 1);
});

test('one guild throwing does not stop the others', async () => {
  await createConfigs([{ serverId: 'g1' }, { serverId: 'g2' }]);
  await createProfiles([
    { serverId: 'g1', userId: 'x' },
    { serverId: 'g2', userId: 'x' },
  ]);
  const broken = fakeGuildWithMembers({
    id: 'g1',
    memberIds: ['a'],
    membersFetchError: new Error('members unavailable'),
  });
  const fine = fakeGuildWithMembers({ id: 'g2', memberIds: ['a'] });
  await run(fakeClient({ guilds: { g1: broken, g2: fine } }), t0, policy);
  const remaining = (await allProfiles()).map((p) => p.serverId);
  assert.deepEqual(remaining, ['g1']);
});
