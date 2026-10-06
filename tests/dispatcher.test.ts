import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Collection, MessageFlags } from 'discord.js';
import type { DingirClient } from '../src/client/DingirClient.ts';
import { type Command, type CommandContext, defineCommand } from '../src/framework/command.ts';
import { UserError } from '../src/framework/errors.ts';
import interactionCreate from '../src/events/interactionCreate.ts';
import { stub } from './fakes/discord.ts';
import { fakeInteraction } from './fakes/interaction.ts';
import { createTestApp } from './helpers/app.ts';
import { nth } from './helpers/assertions.ts';

const app = createTestApp();

after(() => {
  app.close();
});

const clientWith = (...commands: Command[]) =>
  stub<DingirClient>({ slashCommands: new Collection(commands.map((c) => [c.name, c])) });

const dispatch = (client: DingirClient, interaction: unknown) =>
  interactionCreate.run(app, client, interaction as never);

test('ignores interactions that are not chat input commands', async () => {
  const { interaction, calls } = fakeInteraction({ chatInput: false });
  await dispatch(clientWith(), interaction);
  assert.equal(calls.length, 0);
});

test('replies ephemerally when used outside a cached guild', async () => {
  const ran: string[] = [];
  const cmd = defineCommand({
    name: 'test',
    description: 'd',
    run: async () => {
      ran.push('run');
    },
  });
  const { interaction, calls } = fakeInteraction({ inGuild: false });
  await dispatch(clientWith(cmd), interaction);

  assert.deepEqual(calls, [
    {
      method: 'reply',
      payload: { content: 'Dingir only works in servers.', flags: MessageFlags.Ephemeral },
    },
  ]);
  assert.deepEqual(ran, []);
});

test('replies "Unknown command." for unregistered commands and unresolvable subcommands', async () => {
  const cmd = defineCommand({
    name: 'tree',
    description: 'd',
    subcommands: [{ name: 'a', description: 'd', run: async () => {} }],
  });

  const unknown = fakeInteraction({ commandName: 'nope' });
  await dispatch(clientWith(cmd), unknown.interaction);
  assert.deepEqual(unknown.calls, [
    { method: 'reply', payload: { content: 'Unknown command.', flags: MessageFlags.Ephemeral } },
  ]);

  const badSub = fakeInteraction({ commandName: 'tree', subcommand: 'zzz' });
  await dispatch(clientWith(cmd), badSub.interaction);
  assert.equal(badSub.calls.length, 1);
  assert.equal(nth(badSub.calls).payload.content, 'Unknown command.');
});

test('runs the handler with context and applies the defer mode', async () => {
  let seen: CommandContext | undefined;
  const cmd = defineCommand({
    name: 'test',
    description: 'd',
    defer: 'ephemeral',
    run: async (ctx) => {
      seen = ctx;
      await ctx.reply('done');
    },
  });
  const { interaction, calls } = fakeInteraction({ guildId: 'guild-9' });
  await dispatch(clientWith(cmd), interaction);

  assert.deepEqual(
    calls.map((c) => c.method),
    ['deferReply', 'editReply'],
  );
  assert.deepEqual(nth(calls).payload, { flags: MessageFlags.Ephemeral });
  assert.equal(seen?.config.serverId, 'guild-9');
  assert.equal(seen?.interaction, interaction);
});

test('public defer does not set the ephemeral flag', async () => {
  const cmd = defineCommand({
    name: 'test',
    description: 'd',
    defer: 'public',
    run: async () => {},
  });
  const { interaction, calls } = fakeInteraction();
  await dispatch(clientWith(cmd), interaction);
  assert.deepEqual(calls, [{ method: 'deferReply', payload: {} }]);
});

test('a throwing handler produces exactly one ephemeral error reply', async () => {
  const cmd = defineCommand({
    name: 'test',
    description: 'd',
    run: async () => {
      throw new Error('boom');
    },
  });
  const { interaction, calls } = fakeInteraction();
  await dispatch(clientWith(cmd), interaction);

  assert.deepEqual(calls, [
    {
      method: 'reply',
      payload: {
        content: 'Something went wrong running this command.',
        flags: MessageFlags.Ephemeral,
      },
    },
  ]);
  const failure = app.logsAt('error').find((entry) => entry.message === 'Command failed');
  assert.equal(failure?.context?.command, 'test');
});

test('a handler that throws after replying results in a single follow-up error message', async () => {
  const cmd = defineCommand({
    name: 'test',
    description: 'd',
    defer: 'ephemeral',
    run: async (ctx) => {
      await ctx.reply('partial');
      throw new Error('late failure');
    },
  });
  const { interaction, calls } = fakeInteraction();
  await dispatch(clientWith(cmd), interaction);

  assert.deepEqual(
    calls.map((c) => c.method),
    ['deferReply', 'editReply', 'followUp'],
  );
});

test('a failing error reply is logged and does not throw', async () => {
  const cmd = defineCommand({
    name: 'test',
    description: 'd',
    run: async () => {
      throw new Error('boom');
    },
  });
  const { interaction } = fakeInteraction();
  Object.assign(interaction, {
    reply: async () => {
      throw new Error('reply failed');
    },
  });
  await dispatch(clientWith(cmd), interaction);
  assert.ok(
    app.logsAt('error').some((entry) => entry.message === 'Could not send command error reply'),
  );
});

test('a UserError replies ephemerally with its message and is not logged as an error', async () => {
  const cmd = defineCommand({
    name: 'test',
    description: 'd',
    run: async () => {
      throw new UserError('That is not allowed.');
    },
  });
  const { interaction, calls } = fakeInteraction();
  const before = app.logs.length;
  await dispatch(clientWith(cmd), interaction);

  assert.deepEqual(calls, [
    {
      method: 'reply',
      payload: { content: 'That is not allowed.', flags: MessageFlags.Ephemeral },
    },
  ]);
  const entries = app.logs.slice(before);
  assert.equal(entries.filter((entry) => entry.level === 'error').length, 0);
  assert.ok(
    entries.some(
      (entry) => entry.level === 'info' && entry.context?.reason === 'That is not allowed.',
    ),
  );
});

test('a UserError thrown after deferring edits the deferred reply', async () => {
  const cmd = defineCommand({
    name: 'test',
    description: 'd',
    defer: 'ephemeral',
    run: async () => {
      throw new UserError('Nope.');
    },
  });
  const { interaction, calls } = fakeInteraction();
  await dispatch(clientWith(cmd), interaction);

  assert.deepEqual(
    calls.map((c) => c.method),
    ['deferReply', 'editReply'],
  );
  assert.equal(nth(calls, 1).payload.content, 'Nope.');
});

test('defers the reply before looking up the server config', async () => {
  const order: string[] = [];
  const spied = createTestApp();
  const select = spied.db.select.bind(spied.db);
  spied.db.select = ((...args: Parameters<typeof select>) => {
    order.push('config');
    return select(...args);
  }) as typeof spied.db.select;
  try {
    const cmd = defineCommand({
      name: 'test',
      description: 'd',
      defer: 'ephemeral',
      run: async () => {},
    });
    const { interaction } = fakeInteraction();
    const original = interaction.deferReply.bind(interaction);
    interaction.deferReply = (async (...args: Parameters<typeof original>) => {
      order.push('defer');
      return original(...args);
    }) as typeof interaction.deferReply;
    await interactionCreate.run(spied, clientWith(cmd), interaction as never);
    assert.deepEqual(order.slice(0, 2), ['defer', 'config']);
  } finally {
    spied.close();
  }
});
