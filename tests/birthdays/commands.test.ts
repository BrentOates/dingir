import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import mybirthday from '../../src/commands/info/mybirthday.ts';
import profile from '../../src/commands/info/profile.ts';
import type { EmbedBuilder, Guild } from 'discord.js';
import type { Command, ReplyOptions } from '../../src/framework/command.ts';
import { fakeCommandContext } from '../fakes/command.ts';
import { stub } from '../fakes/discord.ts';
import { fakeClient, fakeGuildWithMembers } from '../fakes/guild.ts';
import { createTestApp } from '../helpers/app.ts';
import { last, nth, rejectsUserError } from '../helpers/assertions.ts';
import { dbFixtures } from '../helpers/db.ts';

const app = createTestApp();
const { clearConfigs, clearProfiles, countProfiles, createConfig, createProfiles, findProfile } =
  dbFixtures(app);

after(() => {
  app.close();
});

beforeEach(() => {
  clearProfiles();
  clearConfigs();
});

const exec = async (
  command: Command,
  opts: { subcommand?: string; options?: Record<string, unknown>; guild?: object },
) => {
  const config = createConfig({ serverId: 'guild-1' });
  const { ctx, replies, interaction } = fakeCommandContext(app, opts.options, {
    guild: opts.guild ? stub<Guild>(opts.guild) : undefined,
    config,
    client: fakeClient(),
    subcommand: opts.subcommand,
  });
  await command.resolve(interaction)!.run(ctx);
  return replies;
};

const lastContent = (replies: ReplyOptions[]): string => last(replies).content!;

test('mybirthday set stores Feb 29 as 29', async () => {
  const replies = await exec(mybirthday, { subcommand: 'set', options: { day: 29, month: 2 } });
  const stored = findProfile('user-1');
  assert.equal(stored?.birthdayDay, 29);
  assert.equal(stored?.birthdayMonth, 2);
  assert.match(lastContent(replies), /^Saved. Your next birthday is /);
});

test('mybirthday set rejects invalid dates', async () => {
  await rejectsUserError(
    exec(mybirthday, { subcommand: 'set', options: { day: 31, month: 4 } }),
    /invalid/,
  );
  assert.equal(countProfiles(), 0);
});

test('mybirthday clear removes the birthday but keeps the profile', async () => {
  createProfiles([
    { serverId: 'guild-1', userId: 'user-1', birthdayMonth: 5, birthdayDay: 5, activityScore: 7 },
  ]);
  await exec(mybirthday, { subcommand: 'clear' });
  const stored = findProfile('user-1');
  assert.equal(stored?.birthdayDay, null);
  assert.equal(stored?.birthdayMonth, null);
  assert.equal(stored?.activityScore, 7);
});

test('profile replies for a non-member without creating a profile', async () => {
  const guild = fakeGuildWithMembers({ id: 'guild-1', memberIds: [] });
  await rejectsUserError(
    exec(profile, { options: { member: { id: 'ghost' } }, guild }),
    "That user isn't a member of this server.",
  );
  assert.equal(countProfiles(), 0);
});

test('profile for a member without a profile does not create one', async () => {
  const guild = fakeGuildWithMembers({ id: 'guild-1', memberIds: ['m1'] });
  const member = guild.members.cache.get('m1');
  assert.ok(member);
  Object.assign(member, {
    nickname: null,
    pending: true,
    joinedTimestamp: 0,
    user: { username: 'someone' },
    displayAvatarURL: () => 'https://example.com/a.png',
  });
  const replies = await exec(profile, { options: { member: { id: 'm1' } }, guild });
  const embed = nth(last(replies).embeds as EmbedBuilder[] | undefined).toJSON();
  const field = (name: string): string => embed.fields?.find((f) => f.name === name)?.value ?? '';
  assert.equal(field('Onboarding'), 'Not completed');
  assert.equal(field('Activity Score'), '0');
  assert.equal(countProfiles(), 0);
});

test('mybirthday clear reports no birthday for a profile with only activity', async () => {
  createProfiles([{ serverId: 'guild-1', userId: 'user-1', activityScore: 3 }]);
  const replies = await exec(mybirthday, { subcommand: 'clear' });
  assert.equal(lastContent(replies), "You don't have a birthday set.");
  assert.equal(findProfile('user-1')?.activityScore, 3);
});

test('mybirthday clear confirms removal when a birthday was set', async () => {
  createProfiles([{ serverId: 'guild-1', userId: 'user-1', birthdayMonth: 5, birthdayDay: 5 }]);
  const replies = await exec(mybirthday, { subcommand: 'clear' });
  assert.equal(lastContent(replies), 'Your birthday has been removed.');
});
