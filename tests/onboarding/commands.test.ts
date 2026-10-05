import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { Handler } from '../../src/framework/command.ts';
import NewRolesGroup from '../../src/commands/config/groups/newroles.ts';
import WelcomeGroup, {
  MAX_WELCOME_MESSAGE_LENGTH,
  validateImageUrl,
  validateWelcomeMessage,
} from '../../src/commands/config/groups/welcome.ts';
import { fakeCommandContext, fakeOnboarding, role } from '../fakes/onboarding.ts';
import { createTestApp } from '../helpers/app.ts';
import { rejectsUserError } from '../helpers/assertions.ts';
import { dbFixtures } from '../helpers/db.ts';

const app = createTestApp();
const { clearConfigs, createConfig } = dbFixtures(app.db);

after(() => {
  app.close();
});

beforeEach(() => {
  clearConfigs();
});

const handler = (group: typeof NewRolesGroup, name: string): Handler =>
  group.subcommands.find((s) => s.name === name)!.run;

test('newroles set rejects @everyone, managed and too-high roles and saves nothing', async () => {
  const env = fakeOnboarding({ roles: [role('ok', 1), role('m', 1, true), role('hi', 10)] });
  const { ctx, replies } = fakeCommandContext(
    app, {
      'role-one': env.guild.roles.cache.get('ok'),
      'role-two': env.guild.roles.cache.get('m'),
      'role-three': env.guild.roles.cache.get('hi'),
    },
    env
  );
  await rejectsUserError(handler(NewRolesGroup, 'set')(ctx), /managed[\s\S]*highest role/);
  assert.equal(ctx.config, env.config);
  assert.equal(replies.length, 0);

  const everyone = fakeCommandContext(app, { 'role-one': { id: 'guild-1', name: '@everyone', position: 0 } }, env);
  await rejectsUserError(handler(NewRolesGroup, 'set')(everyone.ctx), /everyone/);
  assert.equal(everyone.ctx.config, env.config);
});

test('newroles set saves valid roles, dedupes, and audits', async () => {
  const env = fakeOnboarding({ roles: [role('a', 1), role('b', 2)] });
  createConfig({ serverId: 'guild-1', auditChannelId: 'audit-1' });
  const a = env.guild.roles.cache.get('a');
  const { ctx, replies } = fakeCommandContext(
    app, { 'role-one': a, 'role-two': env.guild.roles.cache.get('b'), 'role-three': a },
    env
  );
  await handler(NewRolesGroup, 'set')(ctx);
  assert.equal(ctx.config.guestRoleIds, 'a,b');
  assert.equal(env.auditSends.length, 1);
  assert.match(replies[0].content, /set to/);
});

test('newroles get is read-only: no audit, marks missing roles', async () => {
  const env = fakeOnboarding({ roles: [role('a')], config: { guestRoleIds: 'a,gone' } });
  const { ctx, replies } = fakeCommandContext(app, {}, env);
  await handler(NewRolesGroup, 'get')(ctx);
  assert.equal(env.auditSends.length, 0);
  assert.match(replies[0].content, /<@&a>/);
  assert.match(replies[0].content, /gone \(this role no longer exists\)/);

  const empty = fakeOnboarding();
  const e = fakeCommandContext(app, {}, empty);
  await handler(NewRolesGroup, 'get')(e.ctx);
  assert.equal(e.replies[0].content, 'No new-member roles are configured.');
});

test('newroles clear nulls roles and audits', async () => {
  const env = fakeOnboarding({ config: { guestRoleIds: 'a' } });
  createConfig({ serverId: 'guild-1', auditChannelId: 'audit-1', guestRoleIds: 'a' });
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
  assert.match(get.replies[0].content, /Hi \{member\}/);
  assert.match(get.replies[0].content, /Welcome image: Not set/);

  const clear = fakeCommandContext(app, { which: 'all' }, { ...env, config: set.ctx.config });
  await handler(WelcomeGroup as never, 'clear')(clear.ctx);
  assert.equal(clear.ctx.config.welcomeMessage, null);
});

test('welcome preview explains why nothing would be sent', async () => {
  const env = fakeOnboarding({ config: { welcomeMessage: 'hi' } });
  const { ctx, replies } = fakeCommandContext(app, {}, env);
  await handler(WelcomeGroup as never, 'preview')(ctx);
  assert.match(replies[0].content, /disabled/);
  assert.equal(env.systemSends.length, 0);
});

test('welcome preview shows the text without sending', async () => {
  const env = fakeOnboarding({ config: { welcomeMessage: 'hi {member} {member}', systemMessagesEnabled: true } });
  const { ctx, replies } = fakeCommandContext(app, {}, env);
  await handler(WelcomeGroup as never, 'preview')(ctx);
  assert.match(replies[0].content, /hi <@member-1> <@member-1>/);
  assert.equal(env.systemSends.length, 0);
});
