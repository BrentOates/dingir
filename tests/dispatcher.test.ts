import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { Collection, MessageFlags } from 'discord.js';
import type { DatabaseHandle } from '../src/db/db.ts';
import { closeTestDb, createTestDb } from './helpers/db.ts';
import type { DingirClient } from '../src/client/DingirClient.ts';
import { type Command, defineCommand } from '../src/framework/command.ts';
import interactionCreate from '../src/events/interactionCreate.ts';
import { fakeInteraction } from './fakes/interaction.ts';

let db: DatabaseHandle;
const original = { log: console.log, warn: console.warn, error: console.error };
let errors: string[];

before(async () => {
  db = createTestDb();
});

after(async () => {
  closeTestDb(db);
});

beforeEach(() => {
  errors = [];
  console.log = () => {};
  console.warn = () => {};
  console.error = (msg: unknown) => {
    errors.push(String(msg));
  };
});

afterEach(() => {
  Object.assign(console, original);
});

const clientWith = (...commands: Command[]) =>
  ({
    slashCommands: new Collection(commands.map((c) => [c.name, c])),
  }) as unknown as DingirClient;

const dispatch = (client: DingirClient, interaction: unknown) =>
  interactionCreate.run(client, interaction as never);

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
  assert.equal(badSub.calls[0].payload.content, 'Unknown command.');
});

test('runs the handler with context and applies the defer mode', async () => {
  let seen: any;
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
    ['deferReply', 'editReply']
  );
  assert.deepEqual(calls[0].payload, { flags: MessageFlags.Ephemeral });
  assert.equal(seen.config.serverId, 'guild-9');
  assert.equal(seen.interaction, interaction);
});

test('public defer does not set the ephemeral flag', async () => {
  const cmd = defineCommand({ name: 'test', description: 'd', defer: 'public', run: async () => {} });
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
      payload: { content: 'Something went wrong running this command.', flags: MessageFlags.Ephemeral },
    },
  ]);
  assert.ok(errors.some((line) => line.includes('Command failed') && line.includes('command=test')));
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
    ['deferReply', 'editReply', 'followUp']
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
  (interaction as any).reply = async () => {
    throw new Error('reply failed');
  };
  await dispatch(clientWith(cmd), interaction);
  assert.ok(errors.some((line) => line.includes('Could not send command error reply')));
});
