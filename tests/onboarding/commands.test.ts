import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Handler } from '../../src/framework/command';
import NewRolesGroup from '../../src/slash-commands/Config/Subcommands/newroles';
import WelcomeGroup, {
  MAX_WELCOME_MESSAGE_LENGTH,
  validateImageUrl,
  validateWelcomeMessage,
} from '../../src/slash-commands/Config/Subcommands/welcome';
import { fakeCommandContext, fakeOnboarding, role } from '../fakes/onboarding';

const handler = (group: typeof NewRolesGroup, name: string): Handler =>
  group.subcommands.find((s) => s.name === name)!.run;

test('newroles set rejects @everyone, managed and too-high roles and saves nothing', async () => {
  const env = fakeOnboarding({ roles: [role('ok', 1), role('m', 1, true), role('hi', 10)] });
  let saved = false;
  env.config.save = (async () => {
    saved = true;
  }) as never;
  const { ctx, replies } = fakeCommandContext(
    {
      'role-one': env.guild.roles.cache.get('ok'),
      'role-two': env.guild.roles.cache.get('m'),
      'role-three': env.guild.roles.cache.get('hi'),
    },
    env
  );
  await handler(NewRolesGroup, 'set')(ctx);
  assert.equal(saved, false);
  assert.match(replies[0].content, /managed/);
  assert.match(replies[0].content, /highest role/);

  const everyone = fakeCommandContext({ 'role-one': { id: 'guild-1', name: '@everyone', position: 0 } }, env);
  await handler(NewRolesGroup, 'set')(everyone.ctx);
  assert.match(everyone.replies[0].content, /everyone/);
  assert.equal(saved, false);
});

test('newroles set saves valid roles, dedupes, and audits', async () => {
  const env = fakeOnboarding({ roles: [role('a', 1), role('b', 2)] });
  const a = env.guild.roles.cache.get('a');
  const { ctx, replies } = fakeCommandContext(
    { 'role-one': a, 'role-two': env.guild.roles.cache.get('b'), 'role-three': a },
    env
  );
  await handler(NewRolesGroup, 'set')(ctx);
  assert.equal(env.config.guestRoleIds, 'a,b');
  assert.equal(env.auditSends.length, 1);
  assert.match(replies[0].content, /set to/);
});

test('newroles get is read-only: no audit, marks missing roles', async () => {
  const env = fakeOnboarding({ roles: [role('a')], config: { guestRoleIds: 'a,gone' } });
  const { ctx, replies } = fakeCommandContext({}, env);
  await handler(NewRolesGroup, 'get')(ctx);
  assert.equal(env.auditSends.length, 0);
  assert.match(replies[0].content, /<@&a>/);
  assert.match(replies[0].content, /gone \(this role no longer exists\)/);

  const empty = fakeOnboarding();
  const e = fakeCommandContext({}, empty);
  await handler(NewRolesGroup, 'get')(e.ctx);
  assert.equal(e.replies[0].content, 'No new-member roles are configured.');
});

test('newroles clear nulls roles and audits', async () => {
  const env = fakeOnboarding({ config: { guestRoleIds: 'a' } });
  const { ctx } = fakeCommandContext({}, env);
  await handler(NewRolesGroup, 'clear')(ctx);
  assert.equal(env.config.guestRoleIds, null);
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
  const { ctx, replies } = fakeCommandContext({ url: 'ftp://example.com/a.png' }, env);
  await handler(WelcomeGroup as never, 'set-image')(ctx);
  assert.match(replies[0].content, /http/);
  assert.equal(env.config.welcomeMessageBackgroundUrl, null);
});

test('welcome set-image rejects an unreachable image and does not save', async () => {
  const env = fakeOnboarding();
  const { ctx, replies } = fakeCommandContext({ url: 'http://127.0.0.1:1/bg.png' }, env);
  await handler(WelcomeGroup as never, 'set-image')(ctx);
  assert.match(replies[0].content, /could not be used/);
  assert.equal(env.config.welcomeMessageBackgroundUrl, null);
});

test('welcome set-message, get and clear', async () => {
  const env = fakeOnboarding();
  const set = fakeCommandContext({ text: 'Hi {member}' }, env);
  await handler(WelcomeGroup as never, 'set-message')(set.ctx);
  assert.equal(env.config.welcomeMessage, 'Hi {member}');

  const get = fakeCommandContext({}, env);
  await handler(WelcomeGroup as never, 'get')(get.ctx);
  assert.match(get.replies[0].content, /Hi \{member\}/);
  assert.match(get.replies[0].content, /Welcome image: Not set/);

  const clear = fakeCommandContext({ which: 'all' }, env);
  await handler(WelcomeGroup as never, 'clear')(clear.ctx);
  assert.equal(env.config.welcomeMessage, null);
});

test('welcome preview explains why nothing would be sent', async () => {
  const env = fakeOnboarding({ config: { welcomeMessage: 'hi' } });
  const { ctx, replies } = fakeCommandContext({}, env);
  await handler(WelcomeGroup as never, 'preview')(ctx);
  assert.match(replies[0].content, /disabled/);
  assert.equal(env.systemSends.length, 0);
});

test('welcome preview shows the text without sending', async () => {
  const env = fakeOnboarding({ config: { welcomeMessage: 'hi {member} {member}', systemMessagesEnabled: true } });
  const { ctx, replies } = fakeCommandContext({}, env);
  await handler(WelcomeGroup as never, 'preview')(ctx);
  assert.match(replies[0].content, /hi <@member-1> <@member-1>/);
  assert.equal(env.systemSends.length, 0);
});
