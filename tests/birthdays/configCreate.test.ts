import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { PermissionFlagsBits, type Guild } from 'discord.js';
import BirthdaysGroup from '../../src/commands/config/groups/birthdays.ts';
import type { Handler } from '../../src/framework/command.ts';
import { fakeCommandContext } from '../fakes/command.ts';
import { deleteCalendarMessage } from '../../src/services/BirthdayService.ts';
import { stub } from '../fakes/discord.ts';
import { apiError, fakeClient, fakeEditableMessage, fakeTextChannel } from '../fakes/guild.ts';
import { createTestApp } from '../helpers/app.ts';
import { last } from '../helpers/assertions.ts';
import { dbFixtures } from '../helpers/db.ts';

const apps = [createTestApp(), createTestApp(), createTestApp()];
after(() => {
  apps.forEach((a) => a.close());
});

const create: Handler = BirthdaysGroup.subcommands.find((s) => s.name === 'create')!.run;

const setup = (
  app: (typeof apps)[number],
  opts: { failSend?: boolean; failRefresh?: boolean; noPrevious?: boolean } = {},
) => {
  const { clearConfigs, createConfig, findConfig } = dbFixtures(app);
  clearConfigs();
  const order: string[] = [];
  const oldMessage = fakeEditableMessage('old-msg');
  oldMessage.delete = async () => {
    order.push(`delete-old(path=${findConfig('guild-1')?.birthdayCalendarMessagePath})`);
    oldMessage.deleted = true;
  };
  const oldChannel = fakeTextChannel('old-chan', [oldMessage]);
  const newMessage = fakeEditableMessage('sent-1');
  newMessage.delete = async () => {
    order.push('delete-new');
    newMessage.deleted = true;
  };
  if (opts.failRefresh) {
    newMessage.edit = async () => {
      throw new Error('edit failed');
    };
  }
  const target = fakeTextChannel('new-chan', [newMessage]);
  target.send = async () => {
    order.push('send-new');
    if (opts.failSend) {
      throw new Error('missing access');
    }
    return { id: 'sent-1', channelId: 'new-chan', delete: () => newMessage.delete() };
  };
  Object.assign(target, {
    permissionsFor: () => ({ has: () => true }),
  });
  const guild = stub<Guild>({
    id: 'guild-1',
    name: 'Test Guild',
    members: { me: { id: 'bot' } },
    channels: { cache: new Map([['new-chan', target]]), fetch: async () => target },
  });
  const config = createConfig({
    serverId: 'guild-1',
    birthdayCalendarMessagePath: opts.noPrevious ? null : 'old-chan/old-msg',
  });
  const client = fakeClient({ channels: [oldChannel, target] });
  const { ctx, replies } = fakeCommandContext(
    app,
    { channel: { id: 'new-chan' } },
    { guild, config, client },
  );
  return { ctx, replies, order, oldMessage, newMessage, findConfig };
};

test('birthdays create keeps the old calendar and path when sending the new message fails', async () => {
  const app = apps[0]!;
  const { ctx, order, oldMessage, findConfig } = setup(app, { failSend: true });
  await assert.rejects(create(ctx), /missing access/);
  assert.equal(oldMessage.deleted, false);
  assert.deepEqual(order, ['send-new']);
  assert.equal(findConfig('guild-1')?.birthdayCalendarMessagePath, 'old-chan/old-msg');
});

test('birthdays create deletes the old message only after the new path is saved', async () => {
  const app = apps[0]!;
  const { ctx, replies, order, oldMessage, findConfig } = setup(app);
  await create(ctx);
  assert.equal(oldMessage.deleted, true);
  assert.deepEqual(order, ['send-new', 'delete-old(path=new-chan/sent-1)']);
  assert.equal(last(replies).content!.startsWith('Birthday calendar has been created'), true);
  assert.equal(findConfig('guild-1')?.birthdayCalendarMessagePath, 'new-chan/sent-1');
  assert.match(last(replies).content!, /new-chan\/sent-1/);
});

test('birthdays create removes the new message when persisting fails and leaves the old one', async () => {
  const app = apps[1]!;
  const { ctx, oldMessage } = setup(app);
  const deleted: string[] = [];
  const guild = ctx.guild as unknown as {
    channels: { cache: Map<string, { send: (p: unknown) => Promise<unknown> }> };
  };
  const channel = guild.channels.cache.get('new-chan')!;
  channel.send = async () => ({
    id: 'new-msg',
    channelId: 'new-chan',
    delete: async () => void deleted.push('new-msg'),
  });
  app.db.$client.exec('DROP TABLE `ServerConfigs`');
  await assert.rejects(create(ctx));
  assert.deepEqual(deleted, ['new-msg']);
  assert.equal(oldMessage.deleted, false);
});

test('birthdays create restores the old path and keeps the old calendar when population fails', async () => {
  const app = apps[0]!;
  const { ctx, replies, order, oldMessage, newMessage, findConfig } = setup(app, {
    failRefresh: true,
  });
  await assert.rejects(create(ctx), /existing calendar was kept/);
  assert.equal(oldMessage.deleted, false);
  assert.equal(newMessage.deleted, true);
  assert.deepEqual(order, ['send-new', 'delete-new']);
  assert.equal(findConfig('guild-1')?.birthdayCalendarMessagePath, 'old-chan/old-msg');
  assert.equal(replies.length, 0);
});

test('birthdays create clears the path when population fails and there was no calendar', async () => {
  const app = apps[2]!;
  const { ctx, newMessage, findConfig } = setup(app, { failRefresh: true, noPrevious: true });
  await assert.rejects(create(ctx), /nothing was changed/);
  assert.equal(newMessage.deleted, true);
  assert.equal(findConfig('guild-1')?.birthdayCalendarMessagePath, null);
});

const remove: Handler = BirthdaysGroup.subcommands.find((s) => s.name === 'remove')!.run;

const freshApp = () => {
  const app = createTestApp();
  after(() => app.close());
  return app;
};

const setupRemove = (app: (typeof apps)[number], channelsFor: 'normal' | 'none' | 'throw') => {
  const { clearConfigs, createConfig, findConfig } = dbFixtures(app);
  clearConfigs();
  const message = fakeEditableMessage('old-msg');
  const channel = fakeTextChannel('old-chan', [message]);
  const config = createConfig({
    serverId: 'guild-1',
    birthdayCalendarMessagePath: 'old-chan/old-msg',
  });
  const client = fakeClient({
    channels: channelsFor === 'none' ? [] : [channel],
    ...(channelsFor === 'throw'
      ? { channelFetchError: Object.assign(new Error('boom'), { code: 500 }) }
      : {}),
  });
  const { ctx, replies } = fakeCommandContext(app, {}, { config, client });
  return { ctx, replies, message, channel, findConfig };
};

test('birthdays remove clears the path after deleting the message', async () => {
  const { ctx, replies, message, findConfig } = setupRemove(freshApp(), 'normal');
  await remove(ctx);
  assert.equal(message.deleted, true);
  assert.equal(findConfig('guild-1')?.birthdayCalendarMessagePath, null);
  assert.equal(last(replies).content, 'Birthday calendar removed.');
});

test('birthdays remove clears the path when the channel is already gone', async () => {
  const { ctx, replies, findConfig } = setupRemove(freshApp(), 'none');
  await remove(ctx);
  assert.equal(findConfig('guild-1')?.birthdayCalendarMessagePath, null);
  assert.match(last(replies).content!, /already gone/);
});

test('birthdays remove clears the path when the message is already gone (10008)', async () => {
  const { ctx, replies, channel, findConfig } = setupRemove(freshApp(), 'normal');
  channel.messages.fetch = async () => {
    throw apiError(10008);
  };
  await remove(ctx);
  assert.equal(findConfig('guild-1')?.birthdayCalendarMessagePath, null);
  assert.match(last(replies).content!, /already gone/);
});

test('birthdays remove keeps the path and errors when deletion fails', async () => {
  const app = createTestApp();
  after(() => app.close());
  const { ctx, replies, channel, findConfig } = setupRemove(app, 'normal');
  channel.messages.fetch = async () => {
    throw apiError(50013);
  };
  await assert.rejects(remove(ctx), /nothing was changed/);
  assert.equal(findConfig('guild-1')?.birthdayCalendarMessagePath, 'old-chan/old-msg');
  assert.equal(replies.length, 0);
});

test('deleteCalendarMessage classifies results', async () => {
  const app = createTestApp();
  after(() => app.close());
  const msg = fakeEditableMessage('m');
  const chan = fakeTextChannel('c', [msg]);
  assert.equal(
    await deleteCalendarMessage(app, fakeClient({ channels: [chan] }), 'c/m'),
    'deleted',
  );
  assert.equal(await deleteCalendarMessage(app, fakeClient(), 'c/m'), 'already-missing');
  assert.equal(
    await deleteCalendarMessage(app, fakeClient({ channels: [chan] }), 'c/other'),
    'already-missing',
  );
  assert.equal(await deleteCalendarMessage(app, fakeClient(), null), 'already-missing');
  const unknownChannel = fakeClient({ channelFetchError: apiError(10003) });
  assert.equal(await deleteCalendarMessage(app, unknownChannel, 'c/m'), 'already-missing');
  const forbidden = fakeClient({ channelFetchError: apiError(50013) });
  assert.equal(await deleteCalendarMessage(app, forbidden, 'c/m'), 'failed');
  const plain = fakeClient({ channelFetchError: new Error('network') });
  assert.equal(await deleteCalendarMessage(app, plain, 'c/m'), 'failed');
});

test('birthdays create requires Read Message History and sends nothing without it', async () => {
  const app = apps[0]!;
  const { ctx, replies, order, findConfig } = setup(app);
  const channel = await ctx.guild.channels.fetch('new-chan');
  Object.assign(channel!, {
    permissionsFor: () => ({
      has: (flag: bigint) => flag !== PermissionFlagsBits.ReadMessageHistory,
    }),
  });
  await assert.rejects(create(ctx), /read message history/);
  assert.deepEqual(order, []);
  assert.equal(findConfig('guild-1')?.birthdayCalendarMessagePath, 'old-chan/old-msg');
  assert.equal(replies.length, 0);
});
