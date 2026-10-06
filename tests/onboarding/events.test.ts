import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { GuildMember } from 'discord.js';
import guildMemberAdd from '../../src/events/guildMemberAdd.ts';
import guildMemberUpdate from '../../src/events/guildMemberUpdate.ts';
import type { DingirClient } from '../../src/client/DingirClient.ts';
import { stub } from '../fakes/discord.ts';
import { fakeOnboarding, role } from '../fakes/onboarding.ts';
import { createTestApp } from '../helpers/app.ts';
import { dbFixtures } from '../helpers/db.ts';
import { nth } from '../helpers/assertions.ts';

const app = createTestApp();
const { clearConfigs, createConfig } = dbFixtures(app);

after(() => {
  app.close();
});

beforeEach(async () => {
  clearConfigs();
  createConfig({ serverId: 'guild-1', guestRoleIds: 'r1', auditChannelId: 'audit-1' });
});

const update = async (oldState: Record<string, unknown>, newPending: boolean | null) => {
  const env = fakeOnboarding({ roles: [role('r1')] });
  const newMember = Object.assign(env.member, { pending: newPending });
  const oldMember = { guild: env.guild, id: 'member-1', ...oldState } as unknown as GuildMember;
  await guildMemberUpdate.run(app, stub<DingirClient>(env.client), oldMember, newMember);
  return env.roleAdds.length;
};

test('guildMemberUpdate onboards only on pending true to false', async () => {
  assert.equal(await update({ pending: true }, false), 1);
  assert.equal(await update({ pending: false }, false), 0);
  assert.equal(await update({ pending: true }, true), 0);
  assert.equal(await update({ pending: false }, true), 0);
});

const partialUpdate = async (opts: { held?: string[]; bot?: boolean; pending?: boolean }) => {
  const env = fakeOnboarding({ roles: [role('r1')] });
  const held = new Map((opts.held ?? []).map((id) => [id, {}]));
  Object.assign(env.member, {
    pending: opts.pending ?? false,
    roles: { cache: held, add: async (ids: string[]) => void env.roleAdds.push(ids) },
    ...(opts.bot ? { user: stub({ id: 'member-1', tag: 'bot#0001', bot: true }) } : {}),
  });
  const oldMember = { guild: env.guild, id: 'member-1', partial: true } as unknown as GuildMember;
  await guildMemberUpdate.run(app, stub<DingirClient>(env.client), oldMember, env.member);
  return env.roleAdds.length;
};

test('guildMemberUpdate onboards a partial old member who is not pending and lacks guest roles', async () => {
  assert.equal(await partialUpdate({}), 1);
});

test('guildMemberUpdate skips a partial old member who still has to pass screening', async () => {
  assert.equal(await partialUpdate({ pending: true }), 0);
});

test('guildMemberUpdate skips a partial old member who already holds a guest role', async () => {
  assert.equal(await partialUpdate({ held: ['r1'] }), 0);
});

test('guildMemberUpdate skips a partial old member when no guest roles are configured', async () => {
  clearConfigs();
  createConfig({ serverId: 'guild-1', guestRoleIds: null, auditChannelId: 'audit-1' });
  assert.equal(await partialUpdate({}), 0);
  assert.ok(
    app
      .logsAt('info')
      .some(
        (e) =>
          /previous member state unknown/.test(e.message) &&
          JSON.stringify(e.context).includes('member-1'),
      ),
  );
});

test('guildMemberUpdate skips a bot with a partial old member', async () => {
  assert.equal(await partialUpdate({ bot: true }), 0);
});

test('guildMemberAdd audits the join and onboards immediately when not pending', async () => {
  const env = fakeOnboarding({ roles: [role('r1')] });
  Object.assign(env.member, { pending: false });
  await guildMemberAdd.run(app, stub<DingirClient>(env.client), env.member);
  assert.equal(env.roleAdds.length, 1);
  assert.equal(env.auditSends.length, 1);
  assert.match(JSON.stringify(nth(nth(env.auditSends).embeds)), /New member joined/);
});

test('guildMemberAdd waits for screening when the member is pending', async () => {
  const env = fakeOnboarding({ roles: [role('r1')] });
  Object.assign(env.member, { pending: true });
  await guildMemberAdd.run(app, stub<DingirClient>(env.client), env.member);
  assert.equal(env.roleAdds.length, 0);
  assert.equal(env.auditSends.length, 1);
});

test('guildMemberAdd audits a bot join but skips onboarding', async () => {
  const env = fakeOnboarding({
    roles: [role('r1')],
    config: { welcomeMessage: 'Hi {member}' },
  });
  Object.assign(env.member, {
    pending: false,
    user: stub({ id: 'member-1', tag: 'bot#0001', bot: true }),
  });
  await guildMemberAdd.run(app, stub<DingirClient>(env.client), env.member);
  assert.equal(env.auditSends.length, 1);
  assert.match(JSON.stringify(nth(nth(env.auditSends).embeds)), /New member joined/);
  assert.equal(env.roleAdds.length, 0);
  assert.equal(env.systemSends.length, 0);
});

test('guildMemberUpdate ignores bots completing screening', async () => {
  const env = fakeOnboarding({ roles: [role('r1')] });
  Object.assign(env.member, {
    pending: false,
    user: stub({ id: 'member-1', tag: 'bot#0001', bot: true }),
  });
  const oldMember = { guild: env.guild, id: 'member-1', pending: true } as unknown as GuildMember;
  await guildMemberUpdate.run(app, stub<DingirClient>(env.client), oldMember, env.member);
  assert.equal(env.roleAdds.length, 0);
  assert.equal(env.auditSends.length, 0);
});

test('guildMemberUpdate sends the completion audit when screening finishes', async () => {
  const env = fakeOnboarding({ roles: [role('r1')] });
  Object.assign(env.member, { pending: false });
  const oldMember = { guild: env.guild, id: 'member-1', pending: true } as unknown as GuildMember;
  await guildMemberUpdate.run(app, stub<DingirClient>(env.client), oldMember, env.member);
  assert.equal(env.auditSends.length, 1);
  assert.match(JSON.stringify(nth(nth(env.auditSends).embeds)), /Member completed onboarding/);
});
