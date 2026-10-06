import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { Collection, SlashCommandSubcommandBuilder } from 'discord.js';
import type { DingirClient } from '../../src/client/DingirClient.ts';
import ConfigCommand from '../../src/commands/config/config.ts';
import interactionCreate from '../../src/events/interactionCreate.ts';
import { stub } from '../fakes/discord.ts';
import { fakeInteraction } from '../fakes/interaction.ts';
import type { Handler } from '../../src/framework/command.ts';
import NewRolesGroup from '../../src/commands/config/groups/newroles.ts';
import WelcomeGroup, {
  MAX_WELCOME_MESSAGE_LENGTH,
  validateImageUrl,
  validateWelcomeMessage,
} from '../../src/commands/config/groups/welcome.ts';
import SimulateCommand from '../../src/commands/admin/simulate.ts';
import { fakeCommandContext, fakeOnboarding, role } from '../fakes/onboarding.ts';
import { createTestApp } from '../helpers/app.ts';
import { nth, rejectsUserError } from '../helpers/assertions.ts';
import { dbFixtures } from '../helpers/db.ts';

const app = createTestApp();
const { clearConfigs, createConfig } = dbFixtures(app);

after(() => {
  app.close();
});

beforeEach(() => {
  clearConfigs();
});

const handler = (group: typeof NewRolesGroup, name: string): Handler =>
  group.subcommands.find((s) => s.name === name)!.run;

test('newroles set rejects @everyone, managed and too-high roles and saves nothing', async () => {
  const env = fakeOnboarding({
    roles: [role('ok', 1), role('m', 1, true), role('hi', 10)],
  });
  const { ctx, replies } = fakeCommandContext(
    app,
    {
      'role-one': env.guild.roles.cache.get('ok'),
      'role-two': env.guild.roles.cache.get('m'),
      'role-three': env.guild.roles.cache.get('hi'),
    },
    env,
  );
  await rejectsUserError(handler(NewRolesGroup, 'set')(ctx), /managed[\s\S]*highest role/);
  assert.equal(ctx.config, env.config);
  assert.equal(replies.length, 0);

  const everyone = fakeCommandContext(
    app,
    { 'role-one': { id: 'guild-1', name: '@everyone', position: 0 } },
    env,
  );
  await rejectsUserError(handler(NewRolesGroup, 'set')(everyone.ctx), /everyone/);
  assert.equal(everyone.ctx.config, env.config);
});

test('newroles set saves valid roles, dedupes, and audits', async () => {
  const env = fakeOnboarding({ roles: [role('a', 1), role('b', 2)] });
  createConfig({ serverId: 'guild-1', auditChannelId: 'audit-1' });
  const a = env.guild.roles.cache.get('a');
  const { ctx, replies } = fakeCommandContext(
    app,
    {
      'role-one': a,
      'role-two': env.guild.roles.cache.get('b'),
      'role-three': a,
    },
    env,
  );
  await handler(NewRolesGroup, 'set')(ctx);
  assert.equal(ctx.config.guestRoleIds, 'a,b');
  assert.equal(env.auditSends.length, 1);
  assert.match(nth(replies).content!, /set to/);
});

test('newroles get is read-only: no audit, marks missing roles', async () => {
  const env = fakeOnboarding({
    roles: [role('a')],
    config: { guestRoleIds: 'a,gone' },
  });
  const { ctx, replies } = fakeCommandContext(app, {}, env);
  await handler(NewRolesGroup, 'get')(ctx);
  assert.equal(env.auditSends.length, 0);
  assert.match(nth(replies).content!, /<@&a>/);
  assert.match(nth(replies).content!, /gone \(this role no longer exists\)/);

  const empty = fakeOnboarding();
  const e = fakeCommandContext(app, {}, empty);
  await handler(NewRolesGroup, 'get')(e.ctx);
  assert.equal(nth(e.replies).content!, 'No new-member roles are configured.');
});

test('newroles clear nulls roles and audits', async () => {
  const env = fakeOnboarding({ config: { guestRoleIds: 'a' } });
  createConfig({
    serverId: 'guild-1',
    auditChannelId: 'audit-1',
    guestRoleIds: 'a',
  });
  const { ctx } = fakeCommandContext(app, {}, env);
  await handler(NewRolesGroup, 'clear')(ctx);
  assert.equal(ctx.config.guestRoleIds, null);
  assert.equal(env.auditSends.length, 1);
});

test('welcome validators', () => {
  assert.equal(validateImageUrl('https://example.com/a.png'), null);
  assert.equal(validateImageUrl('http://example.com/a.png'), null);
  assert.ok(validateImageUrl('ftp://example.com/a.png'));
  assert.ok(validateImageUrl('file:///etc/passwd'));
  assert.ok(validateImageUrl('not a url'));
  assert.equal(validateWelcomeMessage('hello'), null);
  assert.ok(validateWelcomeMessage('x'.repeat(MAX_WELCOME_MESSAGE_LENGTH + 1)));
  assert.ok(validateWelcomeMessage('   '));
  assert.ok(validateWelcomeMessage('{member}'.repeat(150)));
  assert.equal(validateWelcomeMessage('{member}'.repeat(80)), null);
});

test('welcome set-image rejects non-http URLs without saving', async () => {
  const env = fakeOnboarding();
  const { ctx, replies } = fakeCommandContext(app, { url: 'ftp://example.com/a.png' }, env);
  await rejectsUserError(handler(WelcomeGroup as never, 'set-image')(ctx), /http/);
  assert.equal(replies.length, 0);
  assert.equal(env.config.welcomeMessageBackgroundUrl, null);
});

test('welcome set-image rejects an unreachable image and does not save', async () => {
  const env = fakeOnboarding();
  const { ctx, replies } = fakeCommandContext(app, { url: 'http://127.0.0.1:1/bg.png' }, env);
  await rejectsUserError(handler(WelcomeGroup as never, 'set-image')(ctx), /could not be used/);
  assert.equal(replies.length, 0);
  assert.equal(env.config.welcomeMessageBackgroundUrl, null);
});

test('welcome set-message, get and clear', async () => {
  const env = fakeOnboarding();
  const set = fakeCommandContext(app, { text: 'Hi {member}' }, env);
  await handler(WelcomeGroup as never, 'set-message')(set.ctx);
  assert.equal(set.ctx.config.welcomeMessage, 'Hi {member}');

  const get = fakeCommandContext(app, {}, { ...env, config: set.ctx.config });
  await handler(WelcomeGroup as never, 'get')(get.ctx);
  assert.match(nth(get.replies).content!, /Hi \{member\}/);
  assert.match(nth(get.replies).content!, /Welcome image: Not set/);

  const clear = fakeCommandContext(app, { which: 'all' }, { ...env, config: set.ctx.config });
  await handler(WelcomeGroup as never, 'clear')(clear.ctx);
  assert.equal(clear.ctx.config.welcomeMessage, null);
});

test('welcome preview explains why nothing would be sent', async () => {
  const env = fakeOnboarding({ config: { welcomeMessage: 'hi' } });
  const { ctx, replies } = fakeCommandContext(app, {}, env);
  await handler(WelcomeGroup as never, 'preview')(ctx);
  assert.match(nth(replies).content!, /disabled/);
  assert.equal(env.systemSends.length, 0);
});

test('welcome preview shows the text without sending', async () => {
  const env = fakeOnboarding({
    config: {
      welcomeMessage: 'hi {member} {member}',
      systemMessagesEnabled: true,
    },
  });
  const { ctx, replies } = fakeCommandContext(app, {}, env);
  await handler(WelcomeGroup as never, 'preview')(ctx);
  assert.match(nth(replies).content!, /hi <@member-1> <@member-1>/);
  assert.equal(env.systemSends.length, 0);
});

test('newroles set and clear defer before the audit send', async () => {
  for (const sub of ['set', 'clear']) {
    const env = fakeOnboarding({ roles: [role('a', 1)] });
    clearConfigs();
    createConfig({ serverId: 'guild-1', auditChannelId: 'audit-1' });
    const order: string[] = [];
    const { interaction } = fakeInteraction({
      commandName: 'config',
      group: 'newroles',
      subcommand: sub,
      options: { 'role-one': env.guild.roles.cache.get('a') },
      guild: env.guild,
    });
    Object.assign(interaction, { member: env.member, client: env.client });
    const deferReply = interaction.deferReply.bind(interaction) as (o: unknown) => unknown;
    Object.assign(interaction, {
      deferReply: async (options: unknown) => {
        order.push('defer');
        return deferReply(options);
      },
    });
    const fetchChannel = env.client.channels.fetch.bind(env.client.channels);
    env.client.channels.fetch = (async (id: string) => {
      order.push('audit');
      return fetchChannel(id);
    }) as typeof env.client.channels.fetch;

    const client = stub<DingirClient>({
      slashCommands: new Collection([[ConfigCommand.name, ConfigCommand]]),
    });
    await interactionCreate.run(app, client, interaction as never);
    assert.deepEqual(order, ['defer', 'audit'], sub);
    assert.equal(env.auditSends.length, 1, sub);
  }
});

const TRUNCATED = /\*\(preview truncated\)\*$/;

test('welcome preview is truncated to fit Discord limits', async () => {
  const env = fakeOnboarding({
    config: { welcomeMessage: 'x'.repeat(2000), systemMessagesEnabled: true },
  });
  const { ctx, replies } = fakeCommandContext(app, {}, env);
  await handler(WelcomeGroup as never, 'preview')(ctx);
  const content = nth(replies).content!;
  assert.ok(content.length <= 2000);
  assert.match(content, TRUNCATED);
});

test('welcome get is truncated for long legacy messages', async () => {
  const env = fakeOnboarding({ config: { welcomeMessage: 'y'.repeat(2000) } });
  const { ctx, replies } = fakeCommandContext(app, {}, env);
  await handler(WelcomeGroup as never, 'get')(ctx);
  const content = nth(replies).content!;
  assert.ok(content.length <= 2000);
  assert.match(content, /Welcome image: Not set$/);
  assert.match(content, /preview truncated/);
});

test('simulate onboard truncates a long welcome preview and keeps short ones intact', async () => {
  const run = SimulateCommand.resolve(fakeInteraction({ subcommand: 'onboard' }).interaction)!.run;
  const long = fakeOnboarding({
    config: { welcomeMessage: 'z'.repeat(2000), systemMessagesEnabled: true },
  });
  const a = fakeCommandContext(app, {}, long);
  await run(a.ctx);
  assert.ok(nth(a.replies).content!.length <= 2000);
  assert.match(nth(a.replies).content!, TRUNCATED);

  const short = fakeOnboarding({
    config: { welcomeMessage: 'hello there', systemMessagesEnabled: true },
  });
  const b = fakeCommandContext(app, {}, short);
  await run(b.ctx);
  assert.match(nth(b.replies).content!, /hello there/);
  assert.doesNotMatch(nth(b.replies).content!, /truncated/);
});

test('welcome get keeps the reply within the limit for a legacy long image URL', async () => {
  const env = fakeOnboarding({
    config: {
      welcomeMessage: 'hi',
      welcomeMessageBackgroundUrl: `https://e.com/${'a'.repeat(2100)}`,
    },
  });
  const { ctx, replies } = fakeCommandContext(app, {}, env);
  await handler(WelcomeGroup as never, 'get')(ctx);
  assert.ok(nth(replies).content!.length <= 2000);
});

test('welcome set-image option caps the URL length', () => {
  const sub = WelcomeGroup.subcommands.find((s) => s.name === 'set-image')!;
  const json = (
    sub.options!(
      new SlashCommandSubcommandBuilder().setName('x').setDescription('x'),
    ) as SlashCommandSubcommandBuilder
  ).toJSON();
  assert.equal((json.options![0] as { max_length?: number }).max_length, 1000);
});

test('image failure notes survive truncation in preview and simulate', async () => {
  const config = {
    welcomeMessage: 'q'.repeat(2000),
    welcomeMessageBackgroundUrl: 'http://127.0.0.1:1/bg.png',
    systemMessagesEnabled: true,
  };
  const p = fakeCommandContext(app, {}, fakeOnboarding({ config }));
  await handler(WelcomeGroup as never, 'preview')(p.ctx);
  assert.ok(nth(p.replies).content!.length <= 2000);
  assert.match(nth(p.replies).content!, /The image failed to render/);

  const run = SimulateCommand.resolve(fakeInteraction({ subcommand: 'onboard' }).interaction)!.run;
  const s = fakeCommandContext(app, {}, fakeOnboarding({ config }));
  await run(s.ctx);
  assert.ok(nth(s.replies).content!.length <= 2000);
  assert.match(nth(s.replies).content!, /Image failed/);
});
