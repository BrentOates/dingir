import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { Collection } from 'discord.js';
import type { Sequelize } from 'sequelize-typescript';
import { UserProfile } from '../../src/client/models/UserProfile';
import guildMemberRemove from '../../src/events/guildMemberRemove';
import messageCreate from '../../src/events/messageCreate';
import messageDelete from '../../src/events/messageDelete';
import messageUpdate from '../../src/events/messageUpdate';
import { ConfigService } from '../../src/utilities/ConfigService';
import { HoneyPotEnforcementService } from '../../src/utilities/HoneyPotEnforcementService';
import { UserProfileService } from '../../src/utilities/UserProfileService';
import { createTestDb } from '../helpers/db';
import { auditJson, fakeAuditClient, fakeMember, fakeMessage, fakeUser } from '../fakes/messages';

let db: Sequelize;
const original = { log: console.log, warn: console.warn, error: console.error };

before(async () => {
  db = await createTestDb();
  const config = await ConfigService.getConfig('guild-1');
  await config.update({ auditChannelId: 'audit-1', honeyPotChannelId: 'honey-1' });
});

after(async () => {
  await db.close();
});

beforeEach(() => {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
});

afterEach(async () => {
  Object.assign(console, original);
  HoneyPotEnforcementService.cancel('guild-1', 'u1');
  await UserProfile.destroy({ where: {} });
});

const score = async (): Promise<number | null> =>
  (await UserProfile.findOne({ where: { serverId: 'guild-1', userId: 'u1' } }))?.activityScore ?? null;

test('honeypot message bans the member and does not count activity', async () => {
  const sink = fakeAuditClient();
  let banned: any = null;
  const message = fakeMessage({
    channelId: 'honey-1',
    member: fakeMember('u1', {
      ban: async (opts: unknown) => {
        banned = opts;
      },
    }),
  });
  await messageCreate.run(sink.client, message);
  assert.ok(banned);
  assert.equal(await score(), null);
  assert.equal(sink.sent.length, 1);
  assert.equal(auditJson(sink.sent).description, 'Honey-pot triggered');
});

test('normal messages increment activity once', async () => {
  const sink = fakeAuditClient();
  await messageCreate.run(sink.client, fakeMessage());
  await messageCreate.run(sink.client, fakeMessage());
  assert.equal(await score(), 2);
  assert.equal(sink.sent.length, 0);
});

test('bot, webhook, system and DM messages do not count', async () => {
  const sink = fakeAuditClient();
  await messageCreate.run(sink.client, fakeMessage({ author: fakeUser('u1', { bot: true }) }));
  await messageCreate.run(sink.client, fakeMessage({ webhookId: 'w1' }));
  await messageCreate.run(sink.client, fakeMessage({ system: true }));
  await messageCreate.run(sink.client, fakeMessage({ guildId: null }));
  assert.equal(await score(), null);
});

test('messageDelete never changes the activity score', async () => {
  const sink = fakeAuditClient();
  await UserProfileService.incrementActivityScore('guild-1', 'u1');
  await messageDelete.run(sink.client, fakeMessage());
  assert.equal(await score(), 1);
  assert.equal(sink.sent.length, 1);
});

test('messageDelete audits uncached messages without content', async () => {
  const sink = fakeAuditClient();
  const message = fakeMessage({ partial: true, author: null, id: 'm42', channelId: 'chan-7' });
  message.author = null;
  await messageDelete.run(sink.client, message);
  const embed = auditJson(sink.sent);
  assert.match(embed.description, /not cached/);
  assert.deepEqual(
    embed.fields.map((f: any) => f.value),
    ['<#chan-7>', 'm42']
  );
});

test('messageDelete handles very long content and attachments', async () => {
  const sink = fakeAuditClient();
  const message = fakeMessage({
    content: 'x'.repeat(5000),
    attachments: new Collection([['a', { name: 'a.png' }], ['b', { name: 'b.png' }]]),
    embeds: [{}],
  });
  await messageDelete.run(sink.client, message);
  const embed = auditJson(sink.sent);
  const text = embed.fields.find((f: any) => f.name === 'Message');
  assert.ok(text.value.length <= 1024);
  assert.equal(embed.fields.find((f: any) => f.name === 'Attachments').value, '2: a.png, b.png');
  assert.equal(embed.fields.find((f: any) => f.name === 'Embeds').value, '1');
});

test('messageDelete skips bots and active honeypot enforcement', async () => {
  const sink = fakeAuditClient();
  await messageDelete.run(sink.client, fakeMessage({ author: fakeUser('u1', { bot: true }) }));
  HoneyPotEnforcementService.begin('guild-1', 'u1');
  await messageDelete.run(sink.client, fakeMessage());
  assert.equal(sink.sent.length, 0);
});

test('messageUpdate notes an uncached previous message', async () => {
  const sink = fakeAuditClient();
  await messageUpdate.run(
    sink.client,
    fakeMessage({ partial: true, content: null }),
    fakeMessage({ content: 'edited' })
  );
  const embed = auditJson(sink.sent);
  const previous = embed.fields.find((f: any) => f.name === 'Previous');
  assert.equal(previous.value, '*(not cached)*');
  assert.ok(embed.fields.some((f: any) => f.name === 'Jump to message'));
  assert.ok(embed.fields.some((f: any) => f.name === 'Channel'));
});

test('messageUpdate fetches partial new messages and returns when fetching fails', async () => {
  const sink = fakeAuditClient();
  const failing = fakeMessage({
    partial: true,
    fetch: async () => {
      throw new Error('Unknown Message');
    },
  });
  await messageUpdate.run(sink.client, fakeMessage({ content: 'old' }), failing);
  assert.equal(sink.sent.length, 0);

  const fetched = fakeMessage({ content: 'new' });
  const partial = fakeMessage({ partial: true, fetch: async () => fetched });
  await messageUpdate.run(sink.client, fakeMessage({ content: 'old' }), partial);
  assert.equal(sink.sent.length, 1);
});

test('messageUpdate skips unchanged content and bots', async () => {
  const sink = fakeAuditClient();
  await messageUpdate.run(sink.client, fakeMessage(), fakeMessage());
  await messageUpdate.run(
    sink.client,
    fakeMessage({ content: 'a' }),
    fakeMessage({ content: 'b', author: fakeUser('u1', { bot: true }) })
  );
  assert.equal(sink.sent.length, 0);
});

test('messageUpdate truncates long content', async () => {
  const sink = fakeAuditClient();
  await messageUpdate.run(
    sink.client,
    fakeMessage({ content: 'a'.repeat(4000) }),
    fakeMessage({ content: 'b'.repeat(4000) })
  );
  assert.equal(sink.sent.length, 1);
  assert.ok(auditJson(sink.sent).fields.every((f: any) => f.value.length <= 1024));
});

test('guildMemberRemove handles partial members and deletes profile data', async () => {
  const sink = fakeAuditClient();
  await UserProfileService.incrementActivityScore('guild-1', 'u1');
  const partial = { partial: true, guild: { id: 'guild-1' }, user: fakeUser('u1') } as any;
  await guildMemberRemove.run(sink.client, partial);
  assert.equal(await score(), null);
  const embed = auditJson(sink.sent);
  assert.equal(embed.description, 'Member left');
  assert.equal(embed.author.name, 'useru1');
  assert.equal(embed.fields[1].value, 'Deleted');
});

test('guildMemberRemove during honeypot enforcement only deletes data', async () => {
  const sink = fakeAuditClient();
  await UserProfileService.incrementActivityScore('guild-1', 'u1');
  HoneyPotEnforcementService.begin('guild-1', 'u1');
  const member = fakeMember('u1', { guild: { id: 'guild-1' } }) as any;
  await guildMemberRemove.run(sink.client, member);
  assert.equal(await score(), null);
  assert.equal(sink.sent.length, 0);
});
