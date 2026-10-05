import assert from 'node:assert/strict';
import { after, beforeEach, afterEach, test } from 'node:test';
import { Collection } from 'discord.js';
import guildMemberRemove from '../../src/events/guildMemberRemove.ts';
import messageCreate from '../../src/events/messageCreate.ts';
import messageDelete from '../../src/events/messageDelete.ts';
import messageUpdate from '../../src/events/messageUpdate.ts';
import { updateConfig } from '../../src/services/ConfigService.ts';
import { incrementActivityScore } from '../../src/services/UserProfileService.ts';
import { createTestApp } from '../helpers/app.ts';
import { dbFixtures } from '../helpers/db.ts';
import { auditJson, fakeAuditClient, fakeMember, fakeMessage, fakeUser } from '../fakes/messages.ts';

const app = createTestApp();
const { clearProfiles, findProfile } = dbFixtures(app.db);

after(() => {
  app.close();
});

beforeEach(async () => {
  await updateConfig(app.db, 'guild-1', { auditChannelId: 'audit-1', honeyPotChannelId: 'honey-1' });
});

afterEach(() => {
  app.honeypot.cancel('guild-1', 'u1');
  clearProfiles();
});

const score = async (): Promise<number | null> =>
  findProfile('u1', 'guild-1')?.activityScore ?? null;

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
  await messageCreate.run(app, sink.client, message);
  assert.ok(banned);
  assert.equal(await score(), null);
  assert.equal(sink.sent.length, 1);
  assert.equal(auditJson(sink.sent).description, 'Honey-pot triggered');
});

test('normal messages increment activity once', async () => {
  const sink = fakeAuditClient();
  await messageCreate.run(app, sink.client, fakeMessage());
  await messageCreate.run(app, sink.client, fakeMessage());
  assert.equal(await score(), 2);
  assert.equal(sink.sent.length, 0);
});

test('bot, webhook, system and DM messages do not count', async () => {
  const sink = fakeAuditClient();
  await messageCreate.run(app, sink.client, fakeMessage({ author: fakeUser('u1', { bot: true }) }));
  await messageCreate.run(app, sink.client, fakeMessage({ webhookId: 'w1' }));
  await messageCreate.run(app, sink.client, fakeMessage({ system: true }));
  await messageCreate.run(app, sink.client, fakeMessage({ guildId: null }));
  assert.equal(await score(), null);
});

test('messageDelete never changes the activity score', async () => {
  const sink = fakeAuditClient();
  await incrementActivityScore(app.db, 'guild-1', 'u1');
  await messageDelete.run(app, sink.client, fakeMessage());
  assert.equal(await score(), 1);
  assert.equal(sink.sent.length, 1);
});

test('messageDelete audits uncached messages without content', async () => {
  const sink = fakeAuditClient();
  const message = fakeMessage({ partial: true, author: null, id: 'm42', channelId: 'chan-7' });
  message.author = null;
  await messageDelete.run(app, sink.client, message);
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
  await messageDelete.run(app, sink.client, message);
  const embed = auditJson(sink.sent);
  const text = embed.fields.find((f: any) => f.name === 'Message');
  assert.ok(text.value.length <= 1024);
  assert.equal(embed.fields.find((f: any) => f.name === 'Attachments').value, '2: a.png, b.png');
  assert.equal(embed.fields.find((f: any) => f.name === 'Embeds').value, '1');
});

test('messageDelete skips bots and active honeypot enforcement', async () => {
  const sink = fakeAuditClient();
  await messageDelete.run(app, sink.client, fakeMessage({ author: fakeUser('u1', { bot: true }) }));
  app.honeypot.begin('guild-1', 'u1');
  await messageDelete.run(app, sink.client, fakeMessage());
  assert.equal(sink.sent.length, 0);
});

test('messageUpdate notes an uncached previous message', async () => {
  const sink = fakeAuditClient();
  await messageUpdate.run(
    app,
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
  await messageUpdate.run(app, sink.client, fakeMessage({ content: 'old' }), failing);
  assert.equal(sink.sent.length, 0);

  const fetched = fakeMessage({ content: 'new' });
  const partial = fakeMessage({ partial: true, fetch: async () => fetched });
  await messageUpdate.run(app, sink.client, fakeMessage({ content: 'old' }), partial);
  assert.equal(sink.sent.length, 1);
});

test('messageUpdate skips unchanged content and bots', async () => {
  const sink = fakeAuditClient();
  await messageUpdate.run(app, sink.client, fakeMessage(), fakeMessage());
  await messageUpdate.run(
    app,
    sink.client,
    fakeMessage({ content: 'a' }),
    fakeMessage({ content: 'b', author: fakeUser('u1', { bot: true }) })
  );
  assert.equal(sink.sent.length, 0);
});

test('messageUpdate truncates long content', async () => {
  const sink = fakeAuditClient();
  await messageUpdate.run(
    app,
    sink.client,
    fakeMessage({ content: 'a'.repeat(4000) }),
    fakeMessage({ content: 'b'.repeat(4000) })
  );
  assert.equal(sink.sent.length, 1);
  assert.ok(auditJson(sink.sent).fields.every((f: any) => f.value.length <= 1024));
});

test('guildMemberRemove handles partial members and deletes profile data', async () => {
  const sink = fakeAuditClient();
  await incrementActivityScore(app.db, 'guild-1', 'u1');
  const partial = { partial: true, guild: { id: 'guild-1' }, user: fakeUser('u1') } as any;
  await guildMemberRemove.run(app, sink.client, partial);
  assert.equal(await score(), null);
  const embed = auditJson(sink.sent);
  assert.equal(embed.description, 'Member left');
  assert.equal(embed.author.name, 'useru1');
  assert.equal(embed.fields[1].value, 'Deleted');
});

test('guildMemberRemove during honeypot enforcement only deletes data', async () => {
  const sink = fakeAuditClient();
  await incrementActivityScore(app.db, 'guild-1', 'u1');
  app.honeypot.begin('guild-1', 'u1');
  const member = fakeMember('u1', { guild: { id: 'guild-1' } }) as any;
  await guildMemberRemove.run(app, sink.client, member);
  assert.equal(await score(), null);
  assert.equal(sink.sent.length, 0);
});
