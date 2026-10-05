import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { ChannelType } from 'discord.js';
import type { DatabaseHandle } from '../src/client/database/db';
import { closeTestDb, clearConfigs, createTestDb } from './helpers/db';
import type { ServerConfig } from '../src/client/database/schema';
import { ConfigService } from '../src/services/ConfigService';
import { CommandContext, defineCommand, Handler } from '../src/framework/command';
import {
  booleanSetting,
  booleanText,
  channelClearText,
  channelGetText,
  channelSetText,
  channelSetting,
} from '../src/framework/settings';
import { fakeGuild, fakeInteraction } from './fakes/interaction';

let db: DatabaseHandle;
let config: ServerConfig;
let events: string[];

before(async () => {
  db = createTestDb();
});

after(async () => {
  closeTestDb(db);
});

const originalUpdate = ConfigService.updateConfig;

beforeEach(async () => {
  clearConfigs();
  config = await ConfigService.getConfig('guild-1');
  events = [];
  ConfigService.updateConfig = (async (...args: Parameters<typeof originalUpdate>) => {
    const result = await originalUpdate.apply(ConfigService, args);
    events.push('save');
    return result;
  }) as typeof originalUpdate;
});

afterEach(() => {
  ConfigService.updateConfig = originalUpdate;
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
  const { interaction } = fakeInteraction({ options });
  const guild = fakeGuild(channelIds);
  const replies: string[] = [];
  const ctx = {
    interaction,
    guild,
    member: {},
    config,
    reply: async (response: string | { content?: string }) => {
      events.push('reply');
      replies.push(typeof response === 'string' ? response : (response.content ?? ''));
    },
  } as unknown as CommandContext;
  return { ctx, replies };
};

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

  assert.deepEqual(events, ['save', 'reply']);
  assert.deepEqual(replies, ['Audit channel set to <#123>.']);
  config = await ConfigService.getConfig('guild-1');
  assert.equal(config.auditChannelId, '123');
});

test('channelSetting get reports set, missing and not-set channels', async () => {
  const notSet = makeCtx({}, []);
  await run(channelGroup, 'get')(notSet.ctx);
  assert.deepEqual(notSet.replies, ['Audit channel: not set']);

  config.auditChannelId = '123';
  const present = makeCtx({}, ['123']);
  await run(channelGroup, 'get')(present.ctx);
  assert.deepEqual(present.replies, ['Audit channel: <#123>']);

  const missing = makeCtx({}, []);
  await run(channelGroup, 'get')(missing.ctx);
  assert.match(missing.replies[0], /no longer exists/);
});

test('channelSetting clear nulls the field, saves, then replies', async () => {
  config = await ConfigService.updateConfig('guild-1', { auditChannelId: '123' });
  events.length = 0;

  const { ctx, replies } = makeCtx({});
  await run(channelGroup, 'clear')(ctx);

  assert.deepEqual(events, ['save', 'reply']);
  assert.deepEqual(replies, ['Audit channel cleared.']);
  config = await ConfigService.getConfig('guild-1');
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
  assert.deepEqual(events, ['save', 'reply']);
  assert.deepEqual(set.replies, ['Bot system messages: enabled']);
  config = await ConfigService.getConfig('guild-1');
  assert.equal(config.systemMessagesEnabled, true);

  const get = makeCtx({});
  await run(boolGroup, 'get')(get.ctx);
  assert.deepEqual(get.replies, ['Bot system messages: enabled']);
});

test('booleanSetting requires the enabled option', () => {
  const json = defineCommand({ name: 'config', description: 'd', groups: [boolGroup] }).toJSON();
  const group: any = json.options?.[0];
  const set = group.options.find((o: any) => o.name === 'set');
  assert.equal(set.options[0].name, 'enabled');
  assert.equal(set.options[0].required, true);
});
