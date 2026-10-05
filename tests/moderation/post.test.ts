import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { Collection, PermissionFlagsBits } from 'discord.js';
import type { DatabaseHandle } from '../../src/db/db.ts';
import post from '../../src/commands/admin/post.ts';
import { ConfigService } from '../../src/services/ConfigService.ts';
import { closeTestDb, createTestDb } from '../helpers/db.ts';
import { fakeInteraction } from '../fakes/interaction.ts';
import { auditJson, fakeAuditClient, fakeMember, runSlash } from '../fakes/messages.ts';

let db: DatabaseHandle;
const original = { log: console.log, warn: console.warn, error: console.error };

before(async () => {
  db = createTestDb();
  await ConfigService.updateConfig('guild-1', { auditChannelId: 'audit-1' });
});

after(async () => {
  closeTestDb(db);
});

beforeEach(() => {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
});

after(() => {
  Object.assign(console, original);
});

const target = (send: () => Promise<unknown>, granted: bigint[]) => ({
  id: 'chan-9',
  isTextBased: () => true,
  isDMBased: () => false,
  isSendable: () => true,
  toString: () => '<#chan-9>',
  permissionsFor: () => ({ has: (flag: bigint) => granted.includes(flag) }),
  send,
});

const allPerms = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.AttachFiles,
];

const setup = (channel: ReturnType<typeof target>, options: Record<string, unknown>) => {
  const guild = {
    id: 'guild-1',
    members: { me: {} },
    client: { user: {} },
    channels: {
      cache: new Collection([[channel.id, channel]]),
      fetch: async () => channel,
    },
  };
  const fake = fakeInteraction({
    commandName: 'post',
    options: { channel: { id: channel.id }, ...options },
    guild,
  });
  return fake;
};

test('send failure replies with an error and neither succeeds nor audits', async () => {
  const sink = fakeAuditClient('audit-1', [post]);
  const fake = setup(
    target(async () => {
      throw new Error('boom');
    }, allPerms),
    { content: 'hi' }
  );
  await runSlash(sink.client, fake, { member: fakeMember('user-1') });
  const reply = fake.calls.at(-1)!;
  assert.equal(reply.method, 'editReply');
  assert.match(reply.payload.content, /error was encountered/);
  assert.equal(sink.sent.length, 0);
});

test('success audits then replies with the jump link', async () => {
  const sink = fakeAuditClient('audit-1', [post]);
  const sentPayloads: any[] = [];
  const fake = setup(
    target(async () => {
      sentPayloads.push(1);
      return { url: 'https://discord.com/channels/g/c/m' };
    }, allPerms),
    { content: 'hello world', attachment: { name: 'pic.png' } }
  );
  await runSlash(sink.client, fake, { member: fakeMember('user-1') });
  assert.equal(sentPayloads.length, 1);
  assert.equal(sink.sent.length, 1);
  const embed = auditJson(sink.sent);
  const names = embed.fields.map((f: any) => f.name);
  assert.deepEqual(names, ['Channel', 'Content', 'Attachment', 'Message']);
  assert.equal(embed.fields[2].value, 'pic.png');
  assert.equal(
    fake.calls.at(-1)!.payload.content,
    'Posted in <#chan-9>: https://discord.com/channels/g/c/m'
  );
});

test('missing permission replies clearly and does not send', async () => {
  const sink = fakeAuditClient('audit-1', [post]);
  let sends = 0;
  const fake = setup(
    target(async () => {
      sends += 1;
      return { url: 'x' };
    }, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]),
    { attachment: { name: 'pic.png' } }
  );
  await runSlash(sink.client, fake, { member: fakeMember('user-1') });
  assert.equal(sends, 0);
  assert.equal(sink.sent.length, 0);
  assert.match(fake.calls.at(-1)!.payload.content, /AttachFiles/);
});

test('requires content or attachment and limits content length', async () => {
  const sink = fakeAuditClient('audit-1', [post]);
  const fake = setup(target(async () => ({ url: 'x' }), allPerms), {});
  await runSlash(sink.client, fake, { member: fakeMember('user-1') });
  assert.match(fake.calls.at(-1)!.payload.content, /at least text or an attachment/);

  const content = post.toJSON().options!.find((o: any) => o.name === 'content') as any;
  assert.equal(content.max_length, 2000);
  const channel = post.toJSON().options!.find((o: any) => o.name === 'channel') as any;
  assert.deepEqual(channel.channel_types, [0, 5]);
});
