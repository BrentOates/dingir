import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { type CommandContext, createReply } from '../../src/framework/command.ts';
import mybirthday from '../../src/commands/info/mybirthday.ts';
import profile from '../../src/commands/info/profile.ts';
import { fakeClient, fakeGuildWithMembers } from '../fakes/guild.ts';
import { fakeInteraction } from '../fakes/interaction.ts';
import { createTestApp } from '../helpers/app.ts';
import { rejectsUserError } from '../helpers/assertions.ts';
import { dbFixtures } from '../helpers/db.ts';

const app = createTestApp();
const { clearConfigs, clearProfiles, countProfiles, createConfig, createProfiles, findProfile } =
  dbFixtures(app.db);

after(() => {
  app.close();
});

beforeEach(() => {
  clearProfiles();
  clearConfigs();
});

const exec = async (
  command: typeof mybirthday,
  opts: { subcommand?: string; options?: Record<string, unknown>; guild?: unknown }
) => {
  const config = await createConfig({ serverId: 'guild-1' });
  const fake = fakeInteraction({ subcommand: opts.subcommand, options: opts.options });
  const raw = fake.interaction as any;
  raw.options.getInteger = raw.options.getNumber;
  raw.client = fakeClient();
  const guild = opts.guild ?? { id: 'guild-1', name: 'Test Guild' };
  raw.guild = guild;
  const resolved = command.resolve(fake.interaction)!;
  const ctx = {
    app,
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
  const stored = findProfile('user-1');
  assert.equal(stored?.birthdayDay, 29);
  assert.equal(stored?.birthdayMonth, 2);
  assert.match(lastContent(calls), /^Saved. Your next birthday is /);
});

test('mybirthday set rejects invalid dates', async () => {
  await rejectsUserError(
    exec(mybirthday, { subcommand: 'set', options: { day: 31, month: 4 } }),
    /invalid/
  );
  assert.equal(await countProfiles(), 0);
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
    exec(profile as any, { options: { member: { id: 'ghost' } }, guild }),
    "That user isn't a member of this server."
  );
  assert.equal(await countProfiles(), 0);
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
  assert.equal(await countProfiles(), 0);
});
