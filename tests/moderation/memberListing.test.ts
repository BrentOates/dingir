import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Collection } from 'discord.js';
import noroles from '../../src/commands/admin/noroles.ts';
import rolesince from '../../src/commands/admin/rolesince.ts';
import { buildMemberListing, INLINE_LIMIT } from '../../src/services/MemberListing.ts';
import { createTestApp, FIXED_NOW } from '../helpers/app.ts';
import { fakeInteraction } from '../fakes/interaction.ts';
import { fakeAuditClient, fakeMember, fakeUser, runSlash } from '../fakes/messages.ts';
import { last, nth } from '../helpers/assertions.ts';

const app = createTestApp();
after(() => {
  app.close();
});

const DAY = 24 * 60 * 60 * 1000;
const members = (count: number, joined: number | null = Date.now()) =>
  Array.from({ length: count }, (_, i) => fakeMember(String(100000000000000000 + i), { joinedTimestamp: joined }));

test('small listings reply inline without mentions', () => {
  const result = buildMemberListing('**Header**', 'none', members(3));
  assert.ok(result.content!.length <= INLINE_LIMIT);
  assert.equal(result.files, undefined);
  assert.deepEqual(result.allowedMentions, { parse: [] });
  assert.match(result.content!, /joined <t:\d+:R>/);
});

test('large listings attach a text file with a summary line', () => {
  const result = buildMemberListing('**Header**', 'none', members(200, Date.UTC(2024, 0, 15)));
  assert.ok(result.content!.length < INLINE_LIMIT);
  assert.match(result.content!, /200 members/);
  assert.equal(result.files!.length, 1);
  const file = nth(result.files as unknown[] | undefined) as { name: string; attachment: Buffer };
  assert.equal(file.name, 'members.txt');
  const text = file.attachment.toString('utf8');
  assert.equal(text.split('\n').length, 200);
  assert.match(text, /^user\d+ \(\d+\) — joined 2024-01-15/);
});

test('null join dates are described as unknown', () => {
  const result = buildMemberListing('**Header**', 'none', members(1, null));
  assert.match(result.content!, /join date unknown/);
  const big = buildMemberListing('**Header**', 'none', members(200, null));
  assert.match((nth(big.files as unknown[] | undefined) as { attachment: Buffer }).attachment.toString('utf8'), /join date unknown/);
});

test('empty listing returns the empty message', () => {
  assert.equal(buildMemberListing('h', 'nobody', []).content, 'nobody');
});

test('rolesince filters by days in server and excludes bots', async () => {
  const now = FIXED_NOW.getTime();
  const old = fakeMember('1', { joinedTimestamp: now - 40 * DAY });
  const recent = fakeMember('2', { joinedTimestamp: now - 2 * DAY });
  const bot = fakeMember('3', { joinedTimestamp: now - 90 * DAY, user: fakeUser('3', { bot: true }) });
  const role = {
    toString: () => '<@&r1>',
    members: new Collection([old, recent, bot].map((m) => [m.id, m])),
  };
  let fetched = false;
  const guild = { id: 'guild-1', members: { fetch: async () => void (fetched = true) } };
  const sink = fakeAuditClient('a', [rolesince]);

  const fake = fakeInteraction({ commandName: 'rolesince', options: { role }, guild });
  Object.assign(fake.interaction.options, { getInteger: () => 30 });
  await runSlash(app, sink.client, fake);
  assert.equal(fetched, true);
  assert.equal(nth(fake.calls).method, 'deferReply');
  const content = last(fake.calls).payload.content as string;
  assert.match(content, /<@1>/);
  assert.doesNotMatch(content, /<@2>/);
  assert.doesNotMatch(content, /<@3>/);
  assert.match(content, /at least 30 days ago/);

  const all = fakeInteraction({ commandName: 'rolesince', options: { role }, guild });
  Object.assign(all.interaction.options, { getInteger: () => null });
  await runSlash(app, sink.client, all);
  const everyone = all.calls.at(-1)!.payload.content as string;
  assert.match(everyone, /<@1>/);
  assert.match(everyone, /<@2>/);
});

test('noroles lists only non-bot members with just the everyone role', async () => {
  const plain = fakeMember('1');
  const withRole = fakeMember('2', {
    roles: { cache: new Collection<string, unknown>([['e', {}], ['r', {}]]) },
  });
  const bot = fakeMember('3', { user: fakeUser('3', { bot: true }) });
  const guild = {
    id: 'guild-1',
    members: { fetch: async () => new Collection([plain, withRole, bot].map((m) => [m.id, m])) },
  };
  const sink = fakeAuditClient('a', [noroles]);
  const fake = fakeInteraction({ commandName: 'noroles', guild });
  await runSlash(app, sink.client, fake);
  assert.equal(nth(fake.calls).method, 'deferReply');
  const content = last(fake.calls).payload.content as string;
  assert.match(content, /<@1>/);
  assert.doesNotMatch(content, /<@2>/);
  assert.doesNotMatch(content, /<@3>/);
});
