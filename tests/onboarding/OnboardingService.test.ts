import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttachmentBuilder, type GuildMember } from 'discord.js';
import {
  complete,
  completedScreening,
  formatOnboardingSummary,
  parseRoleIds,
} from '../../src/services/OnboardingService.ts';
import { fakeOnboarding, role } from '../fakes/onboarding.ts';
import { createTestApp } from '../helpers/app.ts';
import { nth } from '../helpers/assertions.ts';

const app = createTestApp();

const okImage = async () => new AttachmentBuilder(Buffer.from('x')).setName('welcome-image.png');
const failImage = async () => {
  throw new Error('bad image');
};

test('parseRoleIds trims and drops empties', () => {
  assert.deepEqual(parseRoleIds(' a, b ,,c'), ['a', 'b', 'c']);
  assert.deepEqual(parseRoleIds(null), []);
});

test('completedScreening only for pending true to false', () => {
  const m = (pending: boolean | null | undefined) => ({ pending }) as unknown as GuildMember;
  assert.equal(completedScreening(m(true), m(false)), true);
  assert.equal(completedScreening(m(false), m(false)), false);
  assert.equal(completedScreening(m(true), m(true)), false);
  assert.equal(completedScreening(m(null), m(false)), false);
  assert.equal(completedScreening(m(undefined), m(false)), false);
});

test('unconfigured server: audit done, roles and welcome skipped, no debug audit', async () => {
  const env = fakeOnboarding();
  const result = await complete(
    app,
    env.client,
    env.member,
    env.config,
    {},
    { renderImage: okImage },
  );
  assert.equal(result.audit, 'done');
  assert.match(result.roles, /^skipped:/);
  assert.match(result.welcome, /^skipped:/);
  assert.equal(env.auditSends.length, 1);
  assert.match(JSON.stringify(nth(nth(env.auditSends).embeds)), /completed onboarding/);
});

test('guest roles are added in one call and unassignable ones filtered', async () => {
  const env = fakeOnboarding({
    roles: [
      role('ok1', 1),
      role('ok2', 2),
      role('managed', 1, true),
      role('high', 10),
      role('guild-1', 0),
    ],
    config: { guestRoleIds: 'ok1,ok2,managed,high,guild-1,gone' },
  });
  const result = await complete(
    app,
    env.client,
    env.member,
    env.config,
    {},
    { renderImage: okImage },
  );
  assert.equal(result.roles, 'done');
  assert.deepEqual(env.roleAdds, [['ok1', 'ok2']]);
  assert.deepEqual(result.rolesSkipped.map((s) => s.id).sort(), [
    'gone',
    'guild-1',
    'high',
    'managed',
  ]);
});

test('no assignable roles skips the roles step without calling add', async () => {
  const env = fakeOnboarding({ roles: [role('high', 10)], config: { guestRoleIds: 'high' } });
  const result = await complete(app, env.client, env.member, env.config);
  assert.match(result.roles, /^skipped:/);
  assert.equal(env.roleAdds.length, 0);
});

test('a failing roles step is audited and does not stop the welcome step', async () => {
  const env = fakeOnboarding({
    roles: [role('r1')],
    failRolesAdd: true,
    config: {
      guestRoleIds: 'r1',
      systemMessagesEnabled: true,
      welcomeMessage: 'Hi {member}',
    },
  });
  const result = await complete(app, env.client, env.member, env.config);
  assert.match(result.roles, /^failed:missing permissions/);
  assert.equal(result.welcome, 'done');
  assert.equal(env.systemSends.length, 1);
  assert.ok(env.auditSends.some((a) => /guest role/.test(JSON.stringify(a.embeds?.[0]))));
});

test('audit failure does not stop later steps', async () => {
  const env = fakeOnboarding({
    roles: [role('r1')],
    failAuditSend: true,
    config: { guestRoleIds: 'r1' },
  });
  const result = await complete(app, env.client, env.member, env.config);
  assert.match(result.audit, /^skipped:/);
  assert.equal(result.roles, 'done');
});

test('welcome replaces every {member} and does not ping others', async () => {
  const env = fakeOnboarding({
    config: { systemMessagesEnabled: true, welcomeMessage: '{member} hello {member}!' },
  });
  const result = await complete(app, env.client, env.member, env.config);
  assert.equal(result.welcome, 'done');
  assert.equal(nth(env.systemSends).content, '<@member-1> hello <@member-1>!');
  assert.deepEqual(nth(env.systemSends).allowedMentions, { users: ['member-1'] });
});

test('welcome skip reasons', async () => {
  const disabled = fakeOnboarding({ config: { welcomeMessage: 'hi' } });
  assert.match(
    (await complete(app, disabled.client, disabled.member, disabled.config)).welcome,
    /disabled/,
  );

  const empty = fakeOnboarding({ config: { systemMessagesEnabled: true } });
  assert.match(
    (await complete(app, empty.client, empty.member, empty.config)).welcome,
    /^skipped:/,
  );

  const noChannel = fakeOnboarding({
    systemChannel: false,
    config: { systemMessagesEnabled: true, welcomeMessage: 'hi' },
  });
  assert.match(
    (await complete(app, noChannel.client, noChannel.member, noChannel.config)).welcome,
    /no system channel/,
  );
});

test('image failure still sends text and audits the image failure', async () => {
  const env = fakeOnboarding({
    config: {
      systemMessagesEnabled: true,
      welcomeMessage: 'hi {member}',
      welcomeMessageBackgroundUrl: 'https://example.com/bg.png',
    },
  });
  const result = await complete(
    app,
    env.client,
    env.member,
    env.config,
    {},
    { renderImage: failImage },
  );
  assert.equal(result.welcome, 'done');
  assert.equal(env.systemSends.length, 1);
  assert.equal(nth(env.systemSends).files, undefined);
  assert.ok(env.auditSends.some((a) => /welcome image/.test(JSON.stringify(a.embeds?.[0]))));
});

test('image failure with no text fails the welcome step', async () => {
  const env = fakeOnboarding({
    config: {
      systemMessagesEnabled: true,
      welcomeMessageBackgroundUrl: 'https://example.com/bg.png',
    },
  });
  const result = await complete(
    app,
    env.client,
    env.member,
    env.config,
    {},
    { renderImage: failImage },
  );
  assert.match(result.welcome, /^failed:/);
  assert.equal(env.systemSends.length, 0);
});

test('welcome send failure is audited and reported', async () => {
  const env = fakeOnboarding({
    failSystemSend: true,
    config: { systemMessagesEnabled: true, welcomeMessage: 'hi' },
  });
  const result = await complete(app, env.client, env.member, env.config);
  assert.match(result.welcome, /^failed:cannot send/);
  assert.ok(env.auditSends.some((a) => /welcome message/.test(JSON.stringify(a.embeds?.[0]))));
});

test('dryRun makes no role, send or audit calls and returns the payload', async () => {
  const env = fakeOnboarding({
    roles: [role('r1')],
    config: {
      guestRoleIds: 'r1',
      debug: true,
      systemMessagesEnabled: true,
      welcomeMessage: 'hi {member}',
      welcomeMessageBackgroundUrl: 'https://example.com/bg.png',
    },
  });
  const result = await complete(
    app,
    env.client,
    env.member,
    env.config,
    { dryRun: true },
    { renderImage: okImage },
  );
  assert.equal(env.roleAdds.length, 0);
  assert.equal(env.systemSends.length, 0);
  assert.equal(env.auditSends.length, 0);
  assert.deepEqual(result.rolesAdded, ['r1']);
  assert.equal(result.welcomePayload?.content, 'hi <@member-1>');
  assert.ok(result.welcomePayload?.image);
  assert.match(formatOnboardingSummary(result), /Would add/);
});

test('debug summary audit is sent only when debug is enabled', async () => {
  const off = fakeOnboarding({ roles: [role('r1')], config: { guestRoleIds: 'r1' } });
  await complete(app, off.client, off.member, off.config);
  assert.equal(off.auditSends.length, 1);

  const on = fakeOnboarding({ config: { debug: true } });
  const result = await complete(app, on.client, on.member, on.config);
  assert.equal(result.debug, 'done');
  assert.equal(on.auditSends.length, 2);
  const summary = JSON.stringify(nth(nth(on.auditSends, 1).embeds));
  assert.match(summary, /diagnostics/);
  assert.match(summary, /skipped:no guest roles configured/);
});

test('skipAudit omits the completion audit but still lists the step', async () => {
  const env = fakeOnboarding({ config: { debug: true } });
  const result = await complete(
    app,
    env.client,
    env.member,
    env.config,
    { skipAudit: true },
    { renderImage: okImage },
  );
  assert.equal(result.audit, 'skipped:already audited on join');
  assert.equal(env.auditSends.length, 1);
  const summary = JSON.stringify(nth(env.auditSends).embeds);
  assert.match(summary, /Onboarding diagnostics/);
  assert.match(summary, /Audit: skipped:already audited on join/);
});
