import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { DateTime } from 'luxon';
import type { DatabaseHandle } from '../../src/client/database/db.ts';
import type { ServerConfig } from '../../src/client/database/schema.ts';
import { notifyBirthdays, refreshCalendar } from '../../src/services/BirthdayService.ts';
import {
  apiError,
  fakeClient,
  fakeGuildWithMembers,
  fakeMessage,
  fakeTextChannel,
} from '../fakes/guild.ts';
import { clearConfigs, clearProfiles, closeTestDb, createConfig, createProfiles, createTestDb } from '../helpers/db.ts';

console.warn = (): void => undefined;
console.error = (): void => undefined;
console.log = (): void => undefined;

const zone = 'Europe/London';
const at = (iso: string): DateTime => DateTime.fromISO(iso, { zone });

let db: DatabaseHandle;

before(async () => {
  db = createTestDb();
});

after(async () => {
  closeTestDb(db);
});

beforeEach(async () => {
  clearProfiles();
  clearConfigs();
});

const makeConfig = (fields: Record<string, unknown> = {}): ServerConfig =>
  createConfig({ serverId: 'g1', ...fields });

test('refreshCalendar: not configured', async () => {
  const config = await makeConfig();
  assert.equal(await refreshCalendar(fakeClient(), config, { zone }), 'not-configured');
});

test('refreshCalendar: channel fetch rejecting keeps the stored path', async () => {
  const config = await makeConfig({ birthdayCalendarMessagePath: 'c1/m1' });
  const client = fakeClient({ channelFetchError: apiError(50001) });
  assert.equal(await refreshCalendar(client, config, { zone }), 'channel-missing');
  assert.equal(config.birthdayCalendarMessagePath, 'c1/m1');
});

test('refreshCalendar: message missing', async () => {
  const config = await makeConfig({ birthdayCalendarMessagePath: 'c1/m1' });
  const client = fakeClient({ channels: [fakeTextChannel('c1')] });
  assert.equal(await refreshCalendar(client, config, { zone }), 'message-missing');
});

test('refreshCalendar: edit failure reports failed', async () => {
  const config = await makeConfig({ birthdayCalendarMessagePath: 'c1/m1' });
  const message = fakeMessage('m1');
  message.edit = async () => {
    throw new Error('boom');
  };
  const client = fakeClient({ channels: [fakeTextChannel('c1', [message])] });
  assert.equal(await refreshCalendar(client, config, { zone }), 'failed');
});

test('refreshCalendar: edits with Feb 29 shown on Feb 28 and today counted', async () => {
  const config = await makeConfig({ birthdayCalendarMessagePath: 'c1/m1' });
  await createProfiles([
    { serverId: 'g1', userId: 'leap', birthdayMonth: 2, birthdayDay: 29 },
    { serverId: 'g1', userId: 'today', birthdayMonth: 2, birthdayDay: 27 },
    { serverId: 'g1', userId: 'nobday' },
  ]);
  const message = fakeMessage('m1');
  const client = fakeClient({ channels: [fakeTextChannel('c1', [message])] });

  const status = await refreshCalendar(client, config, { zone, now: at('2027-02-27T10:00') });
  assert.equal(status, 'updated');
  const [edit] = message.edits;
  assert.deepEqual(edit.allowedMentions, { parse: [] });
  assert.match(edit.content, /Upcoming Birthdays/);
  assert.match(edit.content, /Set yours with `\/mybirthday set`/);
  assert.match(edit.content, /\*\*27 February 2027\*\*\n<@today>/);
  assert.match(edit.content, /\*\*28 February 2027\*\*\n<@leap>/);
  assert.doesNotMatch(edit.content, /nobday/);
  assert.ok(edit.content.indexOf('<@today>') < edit.content.indexOf('<@leap>'));
});

test('refreshCalendar: empty state', async () => {
  const config = await makeConfig({ birthdayCalendarMessagePath: 'c1/m1' });
  const message = fakeMessage('m1');
  const client = fakeClient({ channels: [fakeTextChannel('c1', [message])] });
  assert.equal(await refreshCalendar(client, config, { zone }), 'updated');
  assert.match(message.edits[0].content, /There are no birthdays in this server/);
});

test('notifyBirthdays: skips departed members and mentions only present ones', async () => {
  await makeConfig({ announcementsChannelId: 'ann' });
  await createProfiles([
    { serverId: 'g1', userId: 'here', birthdayMonth: 6, birthdayDay: 1 },
    { serverId: 'g1', userId: 'gone', birthdayMonth: 6, birthdayDay: 1 },
    { serverId: 'g1', userId: 'other', birthdayMonth: 6, birthdayDay: 2 },
  ]);
  const channel = fakeTextChannel('ann');
  const guild = fakeGuildWithMembers({ id: 'g1', memberIds: ['here', 'other'], channels: [channel] });
  const client = fakeClient({ guilds: { g1: guild } });

  await notifyBirthdays(client, { zone, now: at('2027-06-01T09:00') });
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].content, 'Happy Birthday to <@here>!');
  assert.deepEqual(channel.sent[0].allowedMentions, { users: ['here'] });
});

test('notifyBirthdays: Feb 29 is celebrated on Feb 28 in a non-leap year', async () => {
  await makeConfig({ announcementsChannelId: 'ann' });
  await createProfiles([
    { serverId: 'g1', userId: 'a', birthdayMonth: 2, birthdayDay: 29 },
    { serverId: 'g1', userId: 'b', birthdayMonth: 2, birthdayDay: 28 },
  ]);
  const channel = fakeTextChannel('ann');
  const guild = fakeGuildWithMembers({ id: 'g1', memberIds: ['a', 'b'], channels: [channel] });
  const client = fakeClient({ guilds: { g1: guild } });

  await notifyBirthdays(client, { zone, now: at('2027-02-28T09:00') });
  assert.equal(channel.sent.length, 1);
  assert.match(channel.sent[0].content, /<@a>/);
  assert.match(channel.sent[0].content, /<@b>/);

  channel.sent.length = 0;
  await notifyBirthdays(client, { zone, now: at('2027-03-01T09:00') });
  assert.equal(channel.sent.length, 0);
});

test('notifyBirthdays: no announcements channel sends nothing', async () => {
  await makeConfig();
  await createProfiles([{ serverId: 'g1', userId: 'a', birthdayMonth: 6, birthdayDay: 1 }]);
  const channel = fakeTextChannel('ann');
  const guild = fakeGuildWithMembers({ id: 'g1', memberIds: ['a'], channels: [channel] });
  await notifyBirthdays(fakeClient({ guilds: { g1: guild } }), { zone, now: at('2027-06-01T09:00') });
  assert.equal(channel.sent.length, 0);
});
