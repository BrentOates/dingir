import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { ChannelType } from 'discord.js';
import type { ServerConfig } from '../src/db/schema.ts';
import { getConfig, updateConfig } from '../src/services/ConfigService.ts';
import { defineCommand, type Handler, type ReplyOptions } from '../src/framework/command.ts';
import {
  booleanSetting,
  booleanText,
  channelClearText,
  channelGetText,
  channelSetText,
  channelSetting,
} from '../src/framework/settings.ts';
import { fakeCommandContext } from './fakes/command.ts';
import { fakeGuild } from './fakes/discord.ts';
import { createTestApp } from './helpers/app.ts';
import { dbFixtures } from './helpers/db.ts';

const app = createTestApp();
const { clearConfigs, findConfig } = dbFixtures(app);
let config: ServerConfig;
let persistedAtReply: (ServerConfig | null)[];

after(() => {
  app.close();
});

beforeEach(async () => {
  clearConfigs();
  config = await getConfig(app, 'guild-1');
  persistedAtReply = [];
});

const channelGroup = channelSetting({
  name: 'audit',
  description: 'Audit channel',
  field: 'auditChannelId',
  label: 'Audit channel',
  channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
});
const boolGroup = booleanSetting({
  name: 'sysmsgs',
  description: 'System messages',
  field: 'systemMessagesEnabled',
  label: 'Bot system messages',
});

const makeCtx = (options: Record<string, unknown>, channelIds: string[] = []) => {
  const { ctx, replies } = fakeCommandContext(app, options, {
    guild: fakeGuild({ channelIds }),
    config,
  });
  const reply = ctx.reply;
  ctx.reply = async (response) => {
    persistedAtReply.push(findConfig('guild-1'));
    await reply(response);
  };
  return { ctx, replies };
};

const texts = (replies: ReplyOptions[]): (string | undefined)[] => replies.map((r) => r.content);

const run = (group: typeof channelGroup, name: string): Handler =>
  group.subcommands.find((s) => s.name === name)!.run;

test('pure helpers format responses', () => {
  assert.equal(channelSetText('Audit channel', '1'), 'Audit channel set to <#1>.');
  assert.equal(channelGetText('Audit channel', '1', true), 'Audit channel: <#1>');
  assert.equal(channelGetText('Audit channel', null, false), 'Audit channel: not set');
  assert.match(channelGetText('Audit channel', '1', false), /no longer exists/);
  assert.equal(channelClearText('Audit channel'), 'Audit channel cleared.');
  assert.equal(booleanText('Bot system messages', true), 'Bot system messages: enabled');
  assert.equal(booleanText('Bot system messages', false), 'Bot system messages: disabled');
});

test('channelSetting set saves before replying and persists', async () => {
  const { ctx, replies } = makeCtx({ channel: { id: '123' } });
  await run(channelGroup, 'set')(ctx);

  assert.equal(persistedAtReply[0]?.auditChannelId, '123');
  assert.deepEqual(texts(replies), ['Audit channel set to <#123>.']);
  config = await getConfig(app, 'guild-1');
  assert.equal(config.auditChannelId, '123');
});

test('channelSetting get reports set, missing and not-set channels', async () => {
  const notSet = makeCtx({}, []);
  await run(channelGroup, 'get')(notSet.ctx);
  assert.deepEqual(texts(notSet.replies), ['Audit channel: not set']);

  config.auditChannelId = '123';
  const present = makeCtx({}, ['123']);
  await run(channelGroup, 'get')(present.ctx);
  assert.deepEqual(texts(present.replies), ['Audit channel: <#123>']);

  const missing = makeCtx({}, []);
  await run(channelGroup, 'get')(missing.ctx);
  assert.match(missing.replies[0].content!, /no longer exists/);
});

test('channelSetting clear nulls the field, saves, then replies', async () => {
  config = await updateConfig(app, 'guild-1', { auditChannelId: '123' });

  const { ctx, replies } = makeCtx({});
  await run(channelGroup, 'clear')(ctx);

  assert.equal(persistedAtReply[0]?.auditChannelId, null);
  assert.deepEqual(texts(replies), ['Audit channel cleared.']);
  config = await getConfig(app, 'guild-1');
  assert.equal(config.auditChannelId, null);
});

test('channelSetting restricts the channel option types', () => {
  const json = defineCommand({ name: 'config', description: 'd', groups: [channelGroup] }).toJSON();
  const group: any = json.options?.[0];
  const set = group.options.find((o: any) => o.name === 'set');
  assert.deepEqual(set.options[0].channel_types, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);
  assert.equal(set.options[0].required, true);
  assert.deepEqual(
    group.options.map((o: any) => o.name),
    ['set', 'get', 'clear']
  );
});

test('booleanSetting set saves before replying; get reads the stored value', async () => {
  const set = makeCtx({ enabled: true });
  await run(boolGroup, 'set')(set.ctx);
  assert.equal(persistedAtReply[0]?.systemMessagesEnabled, true);
  assert.deepEqual(texts(set.replies), ['Bot system messages: enabled']);
  config = await getConfig(app, 'guild-1');
  assert.equal(config.systemMessagesEnabled, true);

  const get = makeCtx({});
  await run(boolGroup, 'get')(get.ctx);
  assert.deepEqual(texts(get.replies), ['Bot system messages: enabled']);
});

test('booleanSetting requires the enabled option', () => {
  const json = defineCommand({ name: 'config', description: 'd', groups: [boolGroup] }).toJSON();
  const group: any = json.options?.[0];
  const set = group.options.find((o: any) => o.name === 'set');
  assert.equal(set.options[0].name, 'enabled');
  assert.equal(set.options[0].required, true);
});
