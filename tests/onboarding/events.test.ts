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
  await createConfig({ serverId: 'guild-1', guestRoleIds: 'r1', auditChannelId: 'audit-1' });
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

test('guildMemberUpdate skips when the old member is partial', async () => {
  assert.equal(await update({ partial: true, pending: null }, false), 0);
  assert.equal(await update({ partial: true, pending: true }, false), 0);
});

test('guildMemberAdd audits the join and onboards immediately when not pending', async () => {
  const env = fakeOnboarding({ roles: [role('r1')] });
  Object.assign(env.member, { pending: false });
  await guildMemberAdd.run(app, stub<DingirClient>(env.client), env.member);
  assert.equal(env.roleAdds.length, 1);
  assert.match(JSON.stringify(nth(nth(env.auditSends).embeds)), /New member joined/);
});

test('guildMemberAdd waits for screening when the member is pending', async () => {
  const env = fakeOnboarding({ roles: [role('r1')] });
  Object.assign(env.member, { pending: true });
  await guildMemberAdd.run(app, stub<DingirClient>(env.client), env.member);
  assert.equal(env.roleAdds.length, 0);
  assert.equal(env.auditSends.length, 1);
});
