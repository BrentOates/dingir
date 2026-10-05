import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { Sequelize } from 'sequelize-typescript';
import { ServerConfig } from '../../src/client/models/ServerConfig';
import { UserProfile } from '../../src/client/models/UserProfile';
import { initEnv } from '../../src/config/env';
import { CommandContext, createReply } from '../../src/framework/command';
import mybirthday from '../../src/slash-commands/Info/mybirthday';
import profile from '../../src/slash-commands/Info/profile';
import { fakeClient, fakeGuildWithMembers } from '../fakes/guild';
import { fakeInteraction } from '../fakes/interaction';
import { createTestDb } from '../helpers/db';

initEnv({ TOKEN: 't', CLIENT_ID: 'c', DB_PATH: ':memory:', BOT_TIMEZONE: 'Europe/London' });

console.warn = (): void => undefined;
console.error = (): void => undefined;
console.log = (): void => undefined;

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
});

const exec = async (
  command: typeof mybirthday,
  opts: { subcommand?: string; options?: Record<string, unknown>; guild?: unknown }
) => {
  const config = await ServerConfig.create({ serverId: 'guild-1' });
  const fake = fakeInteraction({ subcommand: opts.subcommand, options: opts.options });
  const raw = fake.interaction as any;
  raw.options.getInteger = raw.options.getNumber;
  raw.client = fakeClient();
  const guild = opts.guild ?? { id: 'guild-1', name: 'Test Guild' };
  raw.guild = guild;
  const resolved = command.resolve(fake.interaction)!;
  const ctx = {
    interaction: fake.interaction,
    guild,
    member: raw.member,
    config,
    reply: createReply(fake.interaction),
  } as unknown as CommandContext;
  await resolved.run(ctx);
  return fake.calls;
};

const lastContent = (calls: { payload: any }[]): string => calls[calls.length - 1].payload.content;

test('mybirthday set stores Feb 29 as 29', async () => {
  const calls = await exec(mybirthday, { subcommand: 'set', options: { day: 29, month: 2 } });
  const stored = await UserProfile.findOne({ where: { userId: 'user-1' } });
  assert.equal(stored?.birthdayDay, 29);
  assert.equal(stored?.birthdayMonth, 2);
  assert.match(lastContent(calls), /^Saved! Your next birthday is /);
});

test('mybirthday set rejects invalid dates', async () => {
  const calls = await exec(mybirthday, { subcommand: 'set', options: { day: 31, month: 4 } });
  assert.match(lastContent(calls), /invalid/);
  assert.equal(await UserProfile.count(), 0);
});

test('mybirthday clear removes the birthday but keeps the profile', async () => {
  await UserProfile.create({
    serverId: 'guild-1',
    userId: 'user-1',
    birthdayMonth: 5,
    birthdayDay: 5,
    activityScore: 7,
  });
  await exec(mybirthday, { subcommand: 'clear' });
  const stored = await UserProfile.findOne({ where: { userId: 'user-1' } });
  assert.equal(stored?.birthdayDay, null);
  assert.equal(stored?.birthdayMonth, null);
  assert.equal(stored?.activityScore, 7);
});

test('profile replies for a non-member without creating a profile', async () => {
  const guild = fakeGuildWithMembers({ id: 'guild-1', memberIds: [] });
  const calls = await exec(profile as any, { options: { member: { id: 'ghost' } }, guild });
  assert.equal(lastContent(calls), "That user isn't a member of this server.");
  assert.equal(await UserProfile.count(), 0);
});

test('profile for a member without a profile does not create one', async () => {
  const guild = fakeGuildWithMembers({ id: 'guild-1', memberIds: ['m1'] });
  const member = guild.members.cache.get('m1') as any;
  Object.assign(member, {
    nickname: null,
    pending: true,
    joinedTimestamp: 0,
    user: { username: 'someone' },
    displayAvatarURL: () => 'https://example.com/a.png',
  });
  const calls = await exec(profile as any, { options: { member: { id: 'm1' } }, guild });
  const embed = calls[calls.length - 1].payload.embeds[0].toJSON();
  const field = (name: string): string => embed.fields.find((f: any) => f.name === name).value;
  assert.equal(field('Onboarding'), 'Not completed');
  assert.equal(field('Activity Score'), '0');
  assert.equal(await UserProfile.count(), 0);
});
