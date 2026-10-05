import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageFlags } from 'discord.js';
import {
  type CommandContext,
  defineCommand,
  defineSubcommandGroup,
  createReply,
} from '../src/framework/command.ts';
import { fakeInteraction } from './fakes/interaction.ts';
import { nth } from './helpers/assertions.ts';

const noop = async () => {};

test('defineCommand builds guild-only JSON and admin permissions', () => {
  const json = defineCommand({ name: 'ping', description: 'Pings', run: noop }).toJSON();
  assert.equal(json.name, 'ping');
  assert.deepEqual(json.contexts, [0]);
  assert.equal(json.default_member_permissions, undefined);

  const admin = defineCommand({ name: 'secret', description: 'Admin', adminOnly: true, run: noop });
  assert.equal(admin.toJSON().default_member_permissions, '8');
});

test('defineCommand applies leaf options', () => {
  const json = defineCommand({
    name: 'say',
    description: 'Says',
    options: (b) =>
      b.addStringOption((o) => o.setName('text').setDescription('Text').setRequired(true)),
    run: noop,
  }).toJSON();
  assert.equal(nth(json.options).name, 'text');
});

test('defineCommand rejects invalid shapes with descriptive errors', () => {
  assert.throws(
    () => defineCommand({ name: 'a', description: 'd' }),
    /command "a" must define either run or subcommands/,
  );
  assert.throws(
    () =>
      defineCommand({
        name: 'a',
        description: 'd',
        run: noop,
        subcommands: [{ name: 's', description: 'd', run: noop }],
      }),
    /cannot define both run and subcommands/,
  );
  assert.throws(
    () =>
      defineCommand({
        name: 'a',
        description: 'd',
        defer: 'ephemeral',
        subcommands: [{ name: 's', description: 'd', run: noop }],
      }),
    /not a leaf command/,
  );
  assert.throws(
    () =>
      defineCommand({
        name: 'a',
        description: 'd',
        subcommands: [
          { name: 's', description: 'd', run: noop },
          { name: 's', description: 'd', run: noop },
        ],
      }),
    /Duplicate subcommand\/group name "s" in command "a"/,
  );
  assert.throws(
    () =>
      defineCommand({
        name: 'a',
        description: 'd',
        subcommands: [{ name: 'x', description: 'd', run: noop }],
        groups: [
          {
            name: 'x',
            description: 'd',
            subcommands: [{ name: 's', description: 'd', run: noop }],
          },
        ],
      }),
    /Duplicate subcommand\/group name "x"/,
  );
  assert.throws(
    () =>
      defineCommand({
        name: 'a',
        description: 'd',
        groups: [
          {
            name: 'g',
            description: 'd',
            subcommands: [
              { name: 's', description: 'd', run: noop },
              { name: 's', description: 'd', run: noop },
            ],
          },
        ],
      }),
    /Duplicate subcommand name "s" in group "g"/,
  );
  assert.throws(
    () =>
      defineCommand({
        name: 'a',
        description: 'd',
        groups: [{ name: 'g', description: 'd', subcommands: [] }],
      }),
    /group "g" in command "a" must define at least one subcommand/,
  );
  assert.throws(
    () => defineCommand({ name: 'Bad Name', description: 'd', run: noop }),
    /Invalid command "Bad Name"/,
  );
});

test('resolve routes leaf, subcommand and grouped subcommand handlers', () => {
  const ran: string[] = [];
  const handler = (id: string) => async () => {
    ran.push(id);
  };

  const leaf = defineCommand({
    name: 'leaf',
    description: 'd',
    defer: 'public',
    run: handler('leaf'),
  });
  const resolvedLeaf = leaf.resolve(fakeInteraction({ commandName: 'leaf' }).interaction)!;
  assert.equal(resolvedLeaf.defer, 'public');
  assert.equal(resolvedLeaf.path, 'leaf');

  const group = defineSubcommandGroup({
    name: 'grp',
    description: 'd',
    subcommands: [{ name: 'go', description: 'd', defer: 'ephemeral', run: handler('grp go') }],
  });
  const tree = defineCommand({
    name: 'tree',
    description: 'd',
    subcommands: [{ name: 'plain', description: 'd', run: handler('tree plain') }],
    groups: [group],
  });

  const plain = tree.resolve(fakeInteraction({ subcommand: 'plain' }).interaction)!;
  assert.equal(plain.defer, false);
  assert.equal(plain.path, 'tree plain');
  const grouped = tree.resolve(fakeInteraction({ group: 'grp', subcommand: 'go' }).interaction)!;
  assert.equal(grouped.defer, 'ephemeral');
  assert.equal(grouped.path, 'tree grp go');

  assert.equal(tree.resolve(fakeInteraction({ subcommand: 'missing' }).interaction), undefined);
  assert.equal(tree.resolve(fakeInteraction({}).interaction), undefined);
  assert.equal(
    tree.resolve(fakeInteraction({ group: 'grp', subcommand: 'plain' }).interaction),
    undefined,
  );
  assert.equal(leaf.resolve(fakeInteraction({ subcommand: 'x' }).interaction), undefined);

  return Promise.all(
    [resolvedLeaf.run, plain.run, grouped.run].map((run) => run({} as CommandContext)),
  ).then(() => {
    assert.deepEqual(ran, ['leaf', 'tree plain', 'grp go']);
  });
});

test('reply uses reply() when nothing has been sent, ephemeral by default', async () => {
  const { interaction, calls } = fakeInteraction();
  await createReply(interaction)('hello');
  assert.deepEqual(calls, [
    { method: 'reply', payload: { content: 'hello', flags: MessageFlags.Ephemeral } },
  ]);
});

test('reply omits the ephemeral flag when ephemeral is false', async () => {
  const { interaction, calls } = fakeInteraction();
  await createReply(interaction)({ content: 'public', ephemeral: false });
  assert.deepEqual(nth(calls).payload, { content: 'public' });
});

test('reply uses editReply() after deferring, then followUp() afterwards', async () => {
  const { interaction, calls } = fakeInteraction({ deferred: true });
  const reply = createReply(interaction);
  await reply('first');
  await reply('second');
  assert.deepEqual(
    calls.map((c) => c.method),
    ['editReply', 'followUp'],
  );
  assert.equal(nth(calls).payload.flags, undefined);
  assert.equal(nth(calls, 1).payload.flags, MessageFlags.Ephemeral);
});

test('reply uses followUp() when already replied', async () => {
  const { interaction, calls } = fakeInteraction({ replied: true });
  await createReply(interaction)({ content: 'more', allowedMentions: { parse: [] } });
  assert.equal(nth(calls).method, 'followUp');
  assert.deepEqual(nth(calls).payload.allowedMentions, { parse: [] });
});
