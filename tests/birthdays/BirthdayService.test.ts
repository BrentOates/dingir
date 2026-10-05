import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { DateTime } from 'luxon';
import type { ServerConfig } from '../../src/db/schema.ts';
import { notifyBirthdays, refreshCalendar } from '../../src/services/BirthdayService.ts';
import {
  apiError,
  fakeClient,
  fakeGuildWithMembers,
  fakeEditableMessage,
  fakeTextChannel,
} from '../fakes/guild.ts';
import { createTestApp, type TestApp } from '../helpers/app.ts';
import { dbFixtures } from '../helpers/db.ts';
import { contentOf, nth } from '../helpers/assertions.ts';

const zone = 'Europe/London';
const at = (iso: string): Date => DateTime.fromISO(iso, { zone }).toJSDate();

const base = createTestApp();
const { clearConfigs, clearProfiles, createConfig, createProfiles } = dbFixtures(base);
const appAt = (iso?: string): TestApp =>
  createTestApp({ db: base.db, ...(iso ? { clock: () => at(iso) } : {}) });

after(() => {
  base.close();
});

beforeEach(() => {
  clearProfiles();
  clearConfigs();
});

const makeConfig = (fields: Record<string, unknown> = {}): ServerConfig =>
  createConfig({ serverId: 'g1', ...fields });

test('refreshCalendar: not configured', async () => {
  const config = await makeConfig();
  assert.equal(await refreshCalendar(appAt(), fakeClient(), config), 'not-configured');
});

test('refreshCalendar: channel fetch rejecting keeps the stored path', async () => {
  const config = await makeConfig({ birthdayCalendarMessagePath: 'c1/m1' });
  const client = fakeClient({ channelFetchError: apiError(50001) });
  assert.equal(await refreshCalendar(appAt(), client, config), 'channel-missing');
  assert.equal(config.birthdayCalendarMessagePath, 'c1/m1');
});

test('refreshCalendar: message missing', async () => {
  const config = await makeConfig({ birthdayCalendarMessagePath: 'c1/m1' });
  const client = fakeClient({ channels: [fakeTextChannel('c1')] });
  assert.equal(await refreshCalendar(appAt(), client, config), 'message-missing');
});

test('refreshCalendar: edit failure reports failed', async () => {
  const config = await makeConfig({ birthdayCalendarMessagePath: 'c1/m1' });
  const message = fakeEditableMessage('m1');
  message.edit = async () => {
    throw new Error('boom');
  };
  const client = fakeClient({ channels: [fakeTextChannel('c1', [message])] });
  assert.equal(await refreshCalendar(appAt(), client, config), 'failed');
});

test('refreshCalendar: edits with Feb 29 shown on Feb 28 and today counted', async () => {
  const config = await makeConfig({ birthdayCalendarMessagePath: 'c1/m1' });
  await createProfiles([
    { serverId: 'g1', userId: 'leap', birthdayMonth: 2, birthdayDay: 29 },
    { serverId: 'g1', userId: 'today', birthdayMonth: 2, birthdayDay: 27 },
    { serverId: 'g1', userId: 'nobday' },
  ]);
  const message = fakeEditableMessage('m1');
  const client = fakeClient({ channels: [fakeTextChannel('c1', [message])] });

  const status = await refreshCalendar(appAt('2027-02-27T10:00'), client, config);
  assert.equal(status, 'updated');
  const edit = nth(message.edits);
  const text = contentOf(edit);
  assert.deepEqual(edit.allowedMentions, { parse: [] });
  assert.match(text, /Upcoming Birthdays/);
  assert.match(text, /Set yours with `\/mybirthday set`/);
  assert.match(text, /\*\*27 February 2027\*\*\n<@today>/);
  assert.match(text, /\*\*28 February 2027\*\*\n<@leap>/);
  assert.doesNotMatch(text, /nobday/);
  assert.ok(text.indexOf('<@today>') < text.indexOf('<@leap>'));
});

test('refreshCalendar: empty state', async () => {
  const config = await makeConfig({ birthdayCalendarMessagePath: 'c1/m1' });
  const message = fakeEditableMessage('m1');
  const client = fakeClient({ channels: [fakeTextChannel('c1', [message])] });
  assert.equal(await refreshCalendar(appAt(), client, config), 'updated');
  assert.match(contentOf(nth(message.edits)), /There are no birthdays in this server/);
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

  await notifyBirthdays(appAt('2027-06-01T09:00'), client);
  assert.equal(channel.sent.length, 1);
  assert.equal(nth(channel.sent).content, 'Happy Birthday to <@here>!');
  assert.deepEqual(nth(channel.sent).allowedMentions, { users: ['here'] });
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

  await notifyBirthdays(appAt('2027-02-28T09:00'), client);
  assert.equal(channel.sent.length, 1);
  assert.match(contentOf(nth(channel.sent)), /<@a>/);
  assert.match(contentOf(nth(channel.sent)), /<@b>/);

  channel.sent.length = 0;
  await notifyBirthdays(appAt('2027-03-01T09:00'), client);
  assert.equal(channel.sent.length, 0);
});

test('notifyBirthdays: no announcements channel sends nothing', async () => {
  await makeConfig();
  await createProfiles([{ serverId: 'g1', userId: 'a', birthdayMonth: 6, birthdayDay: 1 }]);
  const channel = fakeTextChannel('ann');
  const guild = fakeGuildWithMembers({ id: 'g1', memberIds: ['a'], channels: [channel] });
  await notifyBirthdays(appAt('2027-06-01T09:00'), fakeClient({ guilds: { g1: guild } }));
  assert.equal(channel.sent.length, 0);
});
