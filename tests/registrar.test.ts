import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { defineCommand, type Command } from '../src/framework/command.ts';
import { commandScope, hashCommands, syncCommands } from '../src/framework/registrar.ts';
import { getState } from '../src/services/BotState.ts';
import { createTestApp } from './helpers/app.ts';

const app = createTestApp();

after(() => {
  app.close();
});

const command = (name: string, description = 'd'): Command =>
  defineCommand({ name, description, run: async () => {} });

const recorder = () => {
  const calls: number[] = [];
  return {
    calls,
    put: async (_env: unknown, commands: readonly Command[]) => {
      calls.push(commands.length);
      return commands.length;
    },
  };
};

beforeEach(() => {
  app.db.$client.exec('DELETE FROM `BotState`');
});

test('hashCommands is stable and changes with command content', () => {
  const a = [command('one'), command('two')];
  assert.equal(hashCommands(a), hashCommands([command('one'), command('two')]));
  assert.notEqual(hashCommands(a), hashCommands([command('one'), command('two', 'changed')]));
  assert.notEqual(hashCommands(a), hashCommands([command('one')]));
});

test('commandScope distinguishes global and dev guild targets', () => {
  assert.equal(
    commandScope({ devGuildId: undefined, clientId: '1' }).stateKey,
    'commandsHash:1:global',
  );
  assert.equal(
    commandScope({ devGuildId: '42', clientId: '1' }).stateKey,
    'commandsHash:1:guild:42',
  );
});

test('syncCommands registers once, then skips while the hash is unchanged', async () => {
  const { calls, put } = recorder();
  const commands = [command('one')];

  assert.equal(await syncCommands(app, commands, put), 'registered');
  assert.equal(await syncCommands(app, commands, put), 'unchanged');
  assert.deepEqual(calls, [1]);
  assert.equal(getState(app.db, 'commandsHash:1:global'), hashCommands(commands));
  assert.ok(app.logsAt('info').some((entry) => /unchanged, skipping/.test(entry.message)));

  assert.equal(await syncCommands(app, [command('one'), command('two')], put), 'registered');
  assert.deepEqual(calls, [1, 2]);
});

test('syncCommands tracks the hash per scope', async () => {
  const { calls, put } = recorder();
  const commands = [command('one')];
  await syncCommands(app, commands, put);

  const dev = { ...app, env: Object.freeze({ ...app.env, devGuildId: '42' }) };
  assert.equal(await syncCommands(dev, commands, put), 'registered');
  assert.equal(await syncCommands(dev, commands, put), 'unchanged');
  assert.deepEqual(calls, [1, 1]);
  assert.equal(getState(app.db, 'commandsHash:1:guild:42'), hashCommands(commands));
});

test('syncCommands does not store the hash when registration fails', async () => {
  const failing = async (): Promise<number> => {
    throw new Error('discord down');
  };
  assert.equal(await syncCommands(app, [command('one')], failing), 'failed');
  assert.equal(getState(app.db, 'commandsHash:1:global'), undefined);
  assert.equal(app.logsAt('error').length, 1);
});

test('syncCommands re-registers when the application id differs', async () => {
  const { calls, put } = recorder();
  const commands = [command('one')];
  assert.equal(await syncCommands(app, commands, put), 'registered');

  const other = { ...app, env: Object.freeze({ ...app.env, clientId: '2' }) };
  assert.equal(await syncCommands(other, commands, put), 'registered');
  assert.equal(await syncCommands(other, commands, put), 'unchanged');
  assert.deepEqual(calls, [1, 1]);
  assert.equal(getState(app.db, 'commandsHash:2:global'), hashCommands(commands));
});

test('syncCommands ignores hashes stored under the old key format', async () => {
  const { calls, put } = recorder();
  const commands = [command('one')];
  app.db.$client.exec(
    `INSERT INTO BotState (key, value, updatedAt) VALUES ('commandsHash:global', '${hashCommands(commands)}', '2024-01-01')`,
  );
  assert.equal(await syncCommands(app, commands, put), 'registered');
  assert.deepEqual(calls, [1]);
});

test('syncCommands warns that the other scope may hold duplicate commands', async () => {
  const { put } = recorder();
  const dev = { ...app, env: Object.freeze({ ...app.env, devGuildId: '42' }) };
  await syncCommands(dev, [command('one')], put);
  assert.ok(app.logsAt('warn').some((e) => /global commands may also exist/.test(e.message)));
  assert.ok(app.logsAt('warn').some((e) => /deploy:commands/.test(e.message)));
});
