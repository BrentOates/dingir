import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { Collection, type Client, type Guild } from 'discord.js';
import guildCreate from '../../src/events/guildCreate.ts';
import guildDelete from '../../src/events/guildDelete.ts';
import type { DingirClient } from '../../src/client/DingirClient.ts';
import { runDataCheck } from '../../src/services/DataCheckService.ts';
import { stub } from '../fakes/discord.ts';
import { apiError, fakeClient, fakeGuildWithMembers } from '../fakes/guild.ts';
import { createTestApp } from '../helpers/app.ts';
import { dbFixtures } from '../helpers/db.ts';

const policy = { minFailures: 3, graceDays: 7 };
const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date('2027-01-01T00:00:00Z');
const at = (days: number): Date => new Date(t0.getTime() + days * DAY);

const base = createTestApp();
const {
  allProfiles,
  clearConfigs,
  clearProfiles,
  countProfiles,
  createConfig,
  createConfigs,
  createProfiles,
  findConfig,
} = dbFixtures(base);
const run = (client: ReturnType<typeof fakeClient>, now: Date): Promise<void> =>
  runDataCheck(createTestApp({ db: base.db, clock: () => now }), client, policy);

after(() => {
  base.close();
});

beforeEach(() => {
  clearProfiles();
  clearConfigs();
});

type Outcome = 'ok' | 'missing' | number;

interface Row {
  name: string;
  /** Stored failure counters before the run. */
  counters?: { count: number; first: Date | null };
  /** What fetching the guild returns: ok, an API error code, or "not found at all". */
  fetch: Outcome;
  /** Fetching the guild fails but the gateway cache still lists it (stale fetch). */
  cached?: boolean;
  members?: string[];
  membersFail?: boolean;
  profiles?: string[];
  days: number;
  /** Expected config afterwards: null when purged. */
  config: { count: number; first: Date | null } | null;
  /** Expected remaining profile user ids. */
  remaining: string[];
}

const reset = { count: 0, first: null };
const rows: Row[] = [
  {
    name: 'transient error: nothing changes, however long it lasts',
    counters: { count: 5, first: t0 },
    fetch: 500,
    profiles: ['a'],
    days: 30,
    config: { count: 5, first: t0 },
    remaining: ['a'],
  },
  {
    name: 'gone, first time: counts but keeps everything',
    fetch: 50001,
    profiles: ['a'],
    days: 0,
    config: { count: 1, first: t0 },
    remaining: ['a'],
  },
  {
    name: 'gone, enough failures but inside the grace period: kept',
    counters: { count: 2, first: t0 },
    fetch: 50001,
    profiles: ['a'],
    days: 6,
    config: { count: 3, first: t0 },
    remaining: ['a'],
  },
  {
    name: 'gone, grace period over but too few failures: kept',
    counters: { count: 1, first: t0 },
    fetch: 50001,
    profiles: ['a'],
    days: 30,
    config: { count: 2, first: t0 },
    remaining: ['a'],
  },
  {
    name: 'gone past both thresholds: purged with its profiles',
    counters: { count: 2, first: t0 },
    fetch: 50001,
    profiles: ['a'],
    days: 7,
    config: null,
    remaining: [],
  },
  {
    name: 'Unknown Guild counts as gone',
    counters: { count: 2, first: t0 },
    fetch: 10004,
    profiles: ['a'],
    days: 7,
    config: null,
    remaining: [],
  },
  {
    name: 'guild missing from the client entirely counts as gone',
    fetch: 'missing',
    days: 0,
    config: { count: 1, first: t0 },
    remaining: [],
  },
  {
    name: 'gone but the gateway still lists the guild: never purged',
    counters: { count: 2, first: t0 },
    fetch: 50001,
    cached: true,
    profiles: ['a'],
    days: 30,
    config: { count: 2, first: t0 },
    remaining: ['a'],
  },
  {
    name: 'ok resets the counters',
    counters: { count: 2, first: t0 },
    fetch: 'ok',
    members: ['a'],
    days: 1,
    config: reset,
    remaining: [],
  },
  {
    name: 'ok deletes departed members, including non-birthday profiles',
    fetch: 'ok',
    members: ['here'],
    profiles: ['here', 'gone-plain', 'gone-bday'],
    days: 0,
    config: reset,
    remaining: ['here'],
  },
  {
    name: 'ok with an empty member list deletes nothing',
    fetch: 'ok',
    members: [],
    profiles: ['a'],
    days: 0,
    config: reset,
    remaining: ['a'],
  },
  {
    name: 'ok but the member fetch fails: nothing deleted, counters still reset',
    counters: { count: 1, first: t0 },
    fetch: 'ok',
    members: ['a'],
    membersFail: true,
    profiles: ['x'],
    days: 0,
    config: reset,
    remaining: ['x'],
  },
];

describe('data check', () => {
  for (const row of rows) {
    test(row.name, async () => {
      createConfig({
        serverId: 'g1',
        accessFailureCount: row.counters?.count ?? 0,
        firstAccessFailureAt: row.counters?.first ?? null,
      });
      createProfiles([
        ...(row.profiles ?? []).map((userId) => ({
          serverId: 'g1',
          userId,
          ...(userId === 'gone-bday' ? { birthdayMonth: 1, birthdayDay: 1 } : {}),
        })),
        { serverId: 'other', userId: 'gone-plain' },
      ]);
      const guilds: Record<string, ReturnType<typeof fakeGuildWithMembers> | Error> =
        row.fetch === 'ok'
          ? {
              g1: fakeGuildWithMembers({
                id: 'g1',
                memberIds: row.members ?? [],
                ...(row.membersFail ? { membersFetchError: new Error('members unavailable') } : {}),
              }),
            }
          : row.fetch === 'missing'
            ? {}
            : { g1: apiError(row.fetch) };
      const client = fakeClient({ guilds });
      if (row.cached) {
        client.guilds.cache.set('g1', stub<Guild>({ id: 'g1' }));
      }
      await run(client, at(row.days));

      const config = findConfig('g1');
      if (row.config === null) {
        assert.equal(config, null, 'config purged');
      } else {
        assert.equal(config?.accessFailureCount, row.config.count);
        assert.deepEqual(config?.firstAccessFailureAt ?? null, row.config.first);
      }
      assert.deepEqual(
        allProfiles()
          .filter((p) => p.serverId === 'g1')
          .map((p) => p.userId)
          .sort(),
        [...row.remaining].sort(),
      );
      assert.equal(
        allProfiles().filter((p) => p.serverId === 'other').length,
        1,
        'other guilds are untouched',
      );
    });
  }

  test('one guild throwing does not stop the others', async () => {
    createConfigs([{ serverId: 'g1' }, { serverId: 'g2' }]);
    createProfiles([
      { serverId: 'g1', userId: 'x' },
      { serverId: 'g2', userId: 'x' },
    ]);
    const broken = fakeGuildWithMembers({
      id: 'g1',
      memberIds: ['a'],
      membersFetchError: new Error('members unavailable'),
    });
    const fine = fakeGuildWithMembers({ id: 'g2', memberIds: ['a'] });
    await run(fakeClient({ guilds: { g1: broken, g2: fine } }), t0);
    assert.deepEqual(
      allProfiles().map((p) => p.serverId),
      ['g1'],
    );
  });
});

describe('data check racing with other events', () => {
  test('a profile created while the member list is being fetched is not deleted', async () => {
    createConfig({ serverId: 'g1' });
    createProfiles([
      { serverId: 'g1', userId: 'a' },
      { serverId: 'g1', userId: 'gone' },
    ]);
    const guild = fakeGuildWithMembers({ id: 'g1', memberIds: ['a'] });
    const fetchMembers = guild.members.fetch.bind(guild.members);
    guild.members.fetch = async (id?: string) => {
      const result = await fetchMembers(id);
      createProfiles([{ serverId: 'g1', userId: 'late-joiner' }]);
      return result;
    };
    await run(fakeClient({ guilds: { g1: guild } }), t0);
    assert.deepEqual(
      allProfiles()
        .map((p) => p.userId)
        .sort(),
      ['a', 'late-joiner'],
    );
  });

  test('a member who left and rejoined during the fetch keeps their new profile', async () => {
    createConfig({ serverId: 'g1' });
    createProfiles([
      { serverId: 'g1', userId: 'a' },
      { serverId: 'g1', userId: 'rejoiner', birthdayMonth: 2, birthdayDay: 3 },
    ]);
    const guild = fakeGuildWithMembers({ id: 'g1', memberIds: ['a'] });
    const fetchMembers = guild.members.fetch.bind(guild.members);
    guild.members.fetch = async (id?: string) => {
      const result = await fetchMembers(id); // assembled while they were away
      base.db.$client.exec("DELETE FROM `UserProfiles` WHERE userId = 'rejoiner'"); // left
      createProfiles([{ serverId: 'g1', userId: 'rejoiner', birthdayMonth: 4, birthdayDay: 5 }]);
      return result;
    };
    await run(fakeClient({ guilds: { g1: guild } }), t0);
    const kept = allProfiles().find((p) => p.userId === 'rejoiner');
    assert.equal(kept?.birthdayMonth, 4);
  });

  test('a guild purged mid-run does not get its config recreated', async () => {
    createConfig({ serverId: 'g1' });
    const client = fakeClient({ guilds: { g1: apiError(50001) } });
    const fetchGuild = client.guilds.fetch.bind(client.guilds);
    client.guilds.fetch = (async (id: string) => {
      clearConfigs();
      return fetchGuild(id);
    }) as typeof client.guilds.fetch;
    await run(client, t0);
    assert.equal(findConfig('g1'), null);
  });

  test('a guild purged by guildDelete before its turn is skipped', async () => {
    createConfigs([{ serverId: 'g1' }, { serverId: 'g2' }]);
    const g2 = fakeGuildWithMembers({ id: 'g2', memberIds: [] });
    const client = fakeClient({ guilds: { g1: apiError(500), g2 } });
    const fetchGuild = client.guilds.fetch.bind(client.guilds);
    client.guilds.fetch = (async (id: string) => {
      const result = await fetchGuild(id).catch(() => g2); // first guild done...
      clearConfigs(); // ...then guildDelete purges the rest
      return result;
    }) as typeof client.guilds.fetch;
    await run(client, t0);
    assert.equal(findConfig('g2'), null, 'g2 was not recreated by the job');
  });

  test('a concurrent guildDelete purge and a data check purge do not conflict', async () => {
    createConfig({ serverId: 'g1', accessFailureCount: 2, firstAccessFailureAt: t0 });
    createProfiles([{ serverId: 'g1', userId: 'a' }]);
    const client = fakeClient({ guilds: { g1: apiError(50001) } });
    const fetchGuild = client.guilds.fetch.bind(client.guilds);
    client.guilds.fetch = (async (id: string) => {
      await guildDelete.run(
        base,
        stub<DingirClient>(client),
        stub<Guild>({ id: 'g1', name: 'G1' }),
      );
      return fetchGuild(id);
    }) as typeof client.guilds.fetch;
    await run(client, at(30));
    assert.equal(findConfig('g1'), null);
    assert.equal(countProfiles(), 0);
  });
});

describe('guild lifecycle events', () => {
  test('guildDelete purges the guild immediately, and is idempotent', async () => {
    createConfigs([{ serverId: 'g1' }, { serverId: 'g2' }]);
    createProfiles([
      { serverId: 'g1', userId: 'a' },
      { serverId: 'g2', userId: 'a' },
    ]);
    const guild = stub<Guild>({ id: 'g1', name: 'G1' });
    await guildDelete.run(base, stub<DingirClient>({}), guild);
    await guildDelete.run(base, stub<DingirClient>({}), guild);
    assert.equal(findConfig('g1'), null);
    assert.ok(findConfig('g2'));
    assert.deepEqual(
      allProfiles().map((p) => p.serverId),
      ['g2'],
    );
  });

  test('guildCreate creates the config and resets failure counters', async () => {
    createConfig({ serverId: 'g1', accessFailureCount: 4, firstAccessFailureAt: t0 });
    const empty = { fetch: async () => new Collection() };
    const guild = stub<Guild>({ id: 'g1', name: 'G1', members: empty });
    const client = stub<DingirClient & Client>({
      guilds: { cache: new Collection([['g1', guild]]) },
    });
    await guildCreate.run(base, client, guild);
    assert.equal(findConfig('g1')?.accessFailureCount, 0);
    assert.equal(findConfig('g1')?.firstAccessFailureAt, null);

    await guildCreate.run(base, client, stub<Guild>({ id: 'g3', name: 'G3', members: empty }));
    assert.ok(findConfig('g3'));
  });

  test('guildCreate records members already pending, and survives a member fetch failure', async () => {
    const pending = {
      id: 'p1',
      guild: { id: 'g1' },
      user: { id: 'p1', bot: false },
      pending: true,
    };
    const guild = stub<Guild>({
      id: 'g1',
      name: 'G1',
      members: { fetch: async () => new Collection([['p1', pending]]) },
    });
    const client = stub<DingirClient & Client>({
      guilds: { cache: new Collection([['g1', guild]]) },
    });
    await guildCreate.run(base, client, guild);
    const recorded = allProfiles().find((p) => p.userId === 'p1');
    assert.equal(recorded?.screeningPendingAt?.getTime(), base.clock().getTime());

    const broken = stub<Guild>({
      id: 'g2',
      name: 'G2',
      members: {
        fetch: async () => {
          throw new Error('timeout');
        },
      },
    });
    const other = stub<DingirClient & Client>({ guilds: { cache: new Collection() } });
    await guildCreate.run(base, other, broken);
    assert.ok(findConfig('g2'));
  });
});
