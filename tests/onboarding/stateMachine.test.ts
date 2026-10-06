import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { Collection, type Client, type Guild, type GuildMember } from 'discord.js';
import guildMemberAdd from '../../src/events/guildMemberAdd.ts';
import guildMemberRemove from '../../src/events/guildMemberRemove.ts';
import guildMemberUpdate from '../../src/events/guildMemberUpdate.ts';
import type { DingirClient } from '../../src/client/DingirClient.ts';
import { complete } from '../../src/services/OnboardingService.ts';
import { syncScreeningState } from '../../src/services/ScreeningService.ts';
import { claimOnboarding } from '../../src/services/UserProfileService.ts';
import { stub } from '../fakes/discord.ts';
import { fakeOnboarding, role } from '../fakes/onboarding.ts';
import { createTestApp, FIXED_NOW } from '../helpers/app.ts';
import { nth } from '../helpers/assertions.ts';
import { dbFixtures } from '../helpers/db.ts';

const app = createTestApp();
const { clearConfigs, clearProfiles, createConfig, createProfiles, findProfile } = dbFixtures(app);

after(() => {
  app.close();
});

beforeEach(() => {
  clearConfigs();
  clearProfiles();
  createConfig({ serverId: 'guild-1', guestRoleIds: 'r1', auditChannelId: 'audit-1' });
});

const NOW = FIXED_NOW;
const JOINED = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
/** Recorded during the current membership. */
const RECENT = new Date(NOW.getTime() - 12 * 60 * 60 * 1000);
/** Recorded before the member's current join: belongs to a previous membership. */
const STALE = new Date('2026-12-01T00:00:00Z');

type Stamp = Date | null;
interface State {
  pending: Stamp;
  onboarded: Stamp;
}

type OldMember = boolean | 'partial';
type Event =
  | { kind: 'join'; pending: boolean; bot?: boolean }
  | { kind: 'update'; old: OldMember; new: boolean | null; bot?: boolean }
  | { kind: 'sweep'; pending: boolean; bot?: boolean }
  | { kind: 'leave' };

interface Row {
  name: string;
  /** Undefined: the member has no profile row. */
  initial?: Partial<State>;
  event: Event;
  failRolesAdd?: boolean;
  /** Undefined: no profile row afterwards. */
  state?: State;
  roles: number;
}

const none = null;
const onboardedNow: State = { pending: none, onboarded: NOW };
const pendingNow: State = { pending: NOW, onboarded: none };

const rows: Row[] = [
  // join
  {
    name: 'join pending, no row: records pending',
    event: { kind: 'join', pending: true },
    state: pendingNow,
    roles: 0,
  },
  {
    name: 'join pending, stale onboarding (rejoin): resets to a new cycle',
    initial: { onboarded: STALE },
    event: { kind: 'join', pending: true },
    state: pendingNow,
    roles: 0,
  },
  {
    name: 'join pending, stale pending: restarts the cycle',
    initial: { pending: STALE },
    event: { kind: 'join', pending: true },
    state: pendingNow,
    roles: 0,
  },
  {
    name: 'join not pending: onboards immediately',
    event: { kind: 'join', pending: false },
    state: onboardedNow,
    roles: 1,
  },
  {
    name: 'join not pending, stale onboarding (rejoin): onboards again',
    initial: { onboarded: STALE },
    event: { kind: 'join', pending: false },
    state: onboardedNow,
    roles: 1,
  },
  {
    name: 'join not pending, roles fail: claim stands, not retried',
    event: { kind: 'join', pending: false },
    failRolesAdd: true,
    state: onboardedNow,
    roles: 0,
  },
  {
    name: 'join of a bot: no state, no onboarding',
    event: { kind: 'join', pending: false, bot: true },
    roles: 0,
  },
  // update, previous state known
  {
    name: 'update true->true, no row: records pending',
    event: { kind: 'update', old: true, new: true },
    state: pendingNow,
    roles: 0,
  },
  {
    name: 'update false->true, no row: records pending',
    event: { kind: 'update', old: false, new: true },
    state: pendingNow,
    roles: 0,
  },
  {
    name: 'update still pending: keeps the recorded time',
    initial: { pending: RECENT },
    event: { kind: 'update', old: true, new: true },
    state: { pending: RECENT, onboarded: none },
    roles: 0,
  },
  {
    name: 'update pending, stale onboarding (missed rejoin): new cycle',
    initial: { onboarded: STALE },
    event: { kind: 'update', old: true, new: true },
    state: pendingNow,
    roles: 0,
  },
  {
    name: 'update true->false, no row: onboards',
    event: { kind: 'update', old: true, new: false },
    state: onboardedNow,
    roles: 1,
  },
  {
    name: 'update true->false, pending recorded: onboards and clears pending',
    initial: { pending: RECENT },
    event: { kind: 'update', old: true, new: false },
    state: onboardedNow,
    roles: 1,
  },
  {
    name: 'update true->false, already onboarded: replay is ignored',
    initial: { onboarded: RECENT },
    event: { kind: 'update', old: true, new: false },
    state: { pending: none, onboarded: RECENT },
    roles: 0,
  },
  {
    name: 'update true->false, stale onboarding (missed rejoin): onboards',
    initial: { onboarded: STALE },
    event: { kind: 'update', old: true, new: false },
    state: onboardedNow,
    roles: 1,
  },
  {
    name: 'update true->false, roles fail: claim stands',
    event: { kind: 'update', old: true, new: false },
    failRolesAdd: true,
    state: onboardedNow,
    roles: 0,
  },
  {
    name: 'update false->false: ignored',
    event: { kind: 'update', old: false, new: false },
    roles: 0,
  },
  {
    name: 'update of a bot: ignored',
    event: { kind: 'update', old: true, new: false, bot: true },
    roles: 0,
  },
  // update, previous state unknown (partial old member)
  {
    name: 'partial old, pending recorded: onboards',
    initial: { pending: RECENT },
    event: { kind: 'update', old: 'partial', new: false },
    state: onboardedNow,
    roles: 1,
  },
  {
    name: 'partial old, nothing recorded: cannot prove screening, ignored',
    event: { kind: 'update', old: 'partial', new: false },
    roles: 0,
  },
  {
    name: 'partial old, already onboarded: ignored',
    initial: { pending: RECENT, onboarded: RECENT },
    event: { kind: 'update', old: 'partial', new: false },
    state: { pending: RECENT, onboarded: RECENT },
    roles: 0,
  },
  {
    name: 'partial old, stale pending (rejoin while offline): ignored and cleaned',
    initial: { pending: STALE },
    event: { kind: 'update', old: 'partial', new: false },
    state: { pending: none, onboarded: none },
    roles: 0,
  },
  {
    name: 'partial old, stale onboarding (rejoin while offline): not re-onboarded, cleaned',
    initial: { onboarded: STALE },
    event: { kind: 'update', old: 'partial', new: false },
    state: { pending: none, onboarded: none },
    roles: 0,
  },
  {
    name: 'partial old, still pending: records pending',
    event: { kind: 'update', old: 'partial', new: true },
    state: pendingNow,
    roles: 0,
  },
  {
    name: 'partial old, pending with stale onboarding (rejoin while offline): new cycle',
    initial: { onboarded: STALE },
    event: { kind: 'update', old: 'partial', new: true },
    state: pendingNow,
    roles: 0,
  },
  {
    name: 'partial old, unknown new pending: ignored',
    event: { kind: 'update', old: 'partial', new: null },
    roles: 0,
  },
  // startup sweep
  {
    name: 'sweep pending member, no row: records pending',
    event: { kind: 'sweep', pending: true },
    state: pendingNow,
    roles: 0,
  },
  {
    name: 'sweep pending member already recorded: unchanged',
    initial: { pending: RECENT },
    event: { kind: 'sweep', pending: true },
    state: { pending: RECENT, onboarded: none },
    roles: 0,
  },
  {
    name: 'sweep pending member with stale onboarding (rejoined offline): new cycle',
    initial: { onboarded: STALE },
    event: { kind: 'sweep', pending: true },
    state: pendingNow,
    roles: 0,
  },
  {
    name: 'sweep pending member with stale pending: re-recorded',
    initial: { pending: STALE },
    event: { kind: 'sweep', pending: true },
    state: pendingNow,
    roles: 0,
  },
  {
    name: 'sweep settled member, no row: nothing recorded',
    event: { kind: 'sweep', pending: false },
    roles: 0,
  },
  {
    name: 'sweep settled member, pending recorded (finished offline): onboarded late',
    initial: { pending: RECENT },
    event: { kind: 'sweep', pending: false },
    state: onboardedNow,
    roles: 1,
  },
  {
    name: 'sweep settled member, stale pending (rejoined offline): not onboarded',
    initial: { pending: STALE },
    event: { kind: 'sweep', pending: false },
    state: { pending: none, onboarded: none },
    roles: 0,
  },
  {
    name: 'sweep settled member already onboarded: unchanged',
    initial: { onboarded: RECENT },
    event: { kind: 'sweep', pending: false },
    state: { pending: none, onboarded: RECENT },
    roles: 0,
  },
  { name: 'sweep ignores bots', event: { kind: 'sweep', pending: true, bot: true }, roles: 0 },
  // leave
  {
    name: 'leave deletes the row',
    initial: { onboarded: RECENT },
    event: { kind: 'leave' },
    roles: 0,
  },
  { name: 'leave with no row is harmless', event: { kind: 'leave' }, roles: 0 },
];

function scenario(row: Row) {
  const env = fakeOnboarding({ roles: [role('r1')], failRolesAdd: row.failRolesAdd });
  const pending =
    row.event.kind === 'update'
      ? row.event.new
      : 'pending' in row.event
        ? row.event.pending
        : false;
  Object.assign(env.member, {
    pending,
    joinedTimestamp: JOINED.getTime(),
    ...('bot' in row.event && row.event.bot
      ? { user: stub({ id: 'member-1', tag: 'bot#0001', bot: true }) }
      : {}),
  });
  const guilds = new Collection<string, Guild>([['guild-1', env.guild]]);
  Object.assign(env.guild.members, {
    fetch: async () => new Collection([['member-1', env.member]]),
  });
  const client = stub<DingirClient & Client>(
    Object.assign(env.client, { guilds: { cache: guilds } }),
  );
  return { env, client };
}

async function play(row: Row): Promise<number> {
  const { env, client } = scenario(row);
  const { event } = row;
  switch (event.kind) {
    case 'join':
      await guildMemberAdd.run(app, client, env.member);
      break;
    case 'leave':
      await guildMemberRemove.run(app, client, env.member);
      break;
    case 'sweep':
      await syncScreeningState(app, client);
      break;
    case 'update': {
      const old =
        event.old === 'partial'
          ? { guild: env.guild, id: 'member-1', partial: true }
          : { guild: env.guild, id: 'member-1', partial: false, pending: event.old };
      await guildMemberUpdate.run(app, client, stub<GuildMember>(old), env.member);
      break;
    }
  }
  return env.roleAdds.length;
}

describe('onboarding state machine', () => {
  for (const row of rows) {
    test(row.name, async () => {
      if (row.initial) {
        createProfiles([
          {
            serverId: 'guild-1',
            userId: 'member-1',
            screeningPendingAt: row.initial.pending ?? null,
            onboardedAt: row.initial.onboarded ?? null,
          },
        ]);
      }
      const roles = await play(row);
      assert.equal(roles, row.roles, 'guest role assignments');
      const profile = findProfile('member-1', 'guild-1');
      if (row.state === undefined) {
        assert.equal(profile, null, 'no profile row');
      } else {
        assert.ok(profile, 'profile row exists');
        assert.deepEqual(
          { pending: profile.screeningPendingAt, onboarded: profile.onboardedAt },
          row.state,
        );
      }
    });
  }
});

describe('onboarding invariants under failure and concurrency', () => {
  test('concurrent identical updates onboard exactly once', async () => {
    const { env, client } = scenario({
      name: '',
      event: { kind: 'update', old: true, new: false },
      roles: 1,
    });
    const old = stub<GuildMember>({
      guild: env.guild,
      id: 'member-1',
      partial: false,
      pending: true,
    });
    await Promise.all([
      guildMemberUpdate.run(app, client, old, env.member),
      guildMemberUpdate.run(app, client, old, env.member),
    ]);
    assert.equal(env.roleAdds.length, 1);
  });

  test('an update arriving while the join audit is in flight does not onboard twice', async () => {
    const { env, client } = scenario({
      name: '',
      event: { kind: 'join', pending: false },
      roles: 1,
    });
    const old = stub<GuildMember>({
      guild: env.guild,
      id: 'member-1',
      partial: false,
      pending: true,
    });
    await Promise.all([
      guildMemberAdd.run(app, client, env.member),
      guildMemberUpdate.run(app, client, old, env.member),
    ]);
    assert.equal(env.roleAdds.length, 1);
  });

  test('a leave during onboarding leaves no profile behind', async () => {
    const { env, client } = scenario({
      name: '',
      event: { kind: 'join', pending: false },
      roles: 1,
    });
    const joining = guildMemberAdd.run(app, client, env.member);
    await new Promise((resolve) => setImmediate(resolve)); // gateway events are separate tasks
    await guildMemberRemove.run(app, client, env.member);
    await joining;
    assert.equal(findProfile('member-1', 'guild-1'), null);
  });

  test('onboarding is claimed once per membership', async () => {
    assert.equal(await claimOnboarding(app.db, 'guild-1', 'member-1', NOW), true);
    assert.equal(await claimOnboarding(app.db, 'guild-1', 'member-1', RECENT), false);
    assert.deepEqual(findProfile('member-1')?.onboardedAt, NOW);
  });

  test('a dry run never touches persisted state', async () => {
    const env = fakeOnboarding({ roles: [role('r1')] });
    await complete(app, stub<DingirClient>(env.client), env.member, env.config, { dryRun: true });
    assert.equal(findProfile('member-1'), null);
    assert.equal(env.roleAdds.length, 0);
  });

  test('a join audits "New member joined"; a bot join is audited but not onboarded', async () => {
    const human = scenario({ name: '', event: { kind: 'join', pending: false }, roles: 1 });
    await guildMemberAdd.run(app, human.client, human.env.member);
    assert.equal(human.env.auditSends.length, 1);
    assert.match(JSON.stringify(nth(nth(human.env.auditSends).embeds)), /New member joined/);

    const bot = scenario({
      name: '',
      event: { kind: 'join', pending: false, bot: true },
      roles: 0,
    });
    await guildMemberAdd.run(app, bot.client, bot.env.member);
    assert.equal(bot.env.auditSends.length, 1);
    assert.equal(bot.env.roleAdds.length, 0);
  });

  test('screening completion sends the completion audit', async () => {
    const { env, client } = scenario({
      name: '',
      event: { kind: 'update', old: true, new: false },
      roles: 1,
    });
    const old = stub<GuildMember>({
      guild: env.guild,
      id: 'member-1',
      partial: false,
      pending: true,
    });
    await guildMemberUpdate.run(app, client, old, env.member);
    assert.match(JSON.stringify(nth(nth(env.auditSends).embeds)), /Member completed onboarding/);
  });

  test('the sweep isolates a failing guild and stops once its guild is removed', async () => {
    const good = scenario({ name: '', event: { kind: 'sweep', pending: true }, roles: 0 });
    const bad = stub<Guild>({
      id: 'guild-2',
      members: {
        fetch: async () => {
          throw new Error('boom');
        },
      },
    });
    const cache = new Collection<string, Guild>([
      ['guild-2', bad],
      ['guild-1', good.env.guild],
    ]);
    const client = stub<Client>(Object.assign(good.env.client, { guilds: { cache } }));
    app.logs.length = 0;
    assert.deepEqual(await syncScreeningState(app, client), { recorded: 1, caughtUp: 0 });
    assert.equal(app.logsAt('error').length, 1);

    clearProfiles();
    cache.delete('guild-1'); // guildDelete purged it mid-sweep
    assert.deepEqual(await syncScreeningState(app, client), { recorded: 0, caughtUp: 0 });
    assert.equal(findProfile('member-1'), null);
  });
});
