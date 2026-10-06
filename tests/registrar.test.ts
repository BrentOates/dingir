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

const inScope = (devGuildId?: string) => ({
  ...app,
  env: Object.freeze({ ...app.env, devGuildId }),
});

const clearer = () => {
  const cleared: string[] = [];
  return {
    cleared,
    clear: async (_env: unknown, guildId: string) => {
      cleared.push(guildId);
    },
  };
};

test('switching from a dev guild to global clears the old guild', async () => {
  const { put } = recorder();
  const { cleared, clear } = clearer();
  const commands = [command('one')];
  await syncCommands(inScope('42'), commands, { put, clear });
  assert.equal(getState(app.db, 'commandsScope:1'), 'guild:42');
  assert.deepEqual(cleared, []);

  assert.equal(await syncCommands(inScope(), commands, { put, clear }), 'registered');
  assert.deepEqual(cleared, ['42']);
  assert.equal(getState(app.db, 'commandsScope:1'), 'global');
  assert.ok(app.logsAt('info').some((e) => /Cleared application commands/.test(e.message)));
});

test('switching between dev guilds clears the previous one', async () => {
  const { put } = recorder();
  const { cleared, clear } = clearer();
  const commands = [command('one')];
  await syncCommands(inScope('A'), commands, { put, clear });
  await syncCommands(inScope('B'), commands, { put, clear });
  assert.deepEqual(cleared, ['A']);
  assert.equal(getState(app.db, 'commandsScope:1'), 'guild:B');
  // Staying put clears nothing further.
  await syncCommands(inScope('B'), [command('one'), command('two')], { put, clear });
  assert.deepEqual(cleared, ['A']);
});

test('switching from global to a dev guild never clears global commands', async () => {
  const { put } = recorder();
  const { cleared, clear } = clearer();
  const commands = [command('one')];
  await syncCommands(inScope(), commands, { put, clear });
  app.logs.length = 0;
  await syncCommands(inScope('42'), commands, { put, clear });
  assert.deepEqual(cleared, []);
  assert.equal(getState(app.db, 'commandsScope:1'), 'guild:42');
  assert.ok(app.logsAt('warn').some((e) => /deploy:commands/.test(e.message)));
});

test('a failed registration clears nothing and keeps the recorded scope', async () => {
  const { put } = recorder();
  const { cleared, clear } = clearer();
  await syncCommands(inScope('42'), [command('one')], { put, clear });
  const failing = async (): Promise<number> => {
    throw new Error('discord down');
  };
  assert.equal(await syncCommands(inScope(), [command('one')], { put: failing, clear }), 'failed');
  assert.deepEqual(cleared, []);
  assert.equal(getState(app.db, 'commandsScope:1'), 'guild:42');
});

test('a failed cleanup keeps the old scope so the next run retries it', async () => {
  const { put } = recorder();
  const commands = [command('one')];
  await syncCommands(inScope('42'), commands, { put });
  const failingClear = async (): Promise<void> => {
    throw new Error('forbidden');
  };
  assert.equal(await syncCommands(inScope(), commands, { put, clear: failingClear }), 'registered');
  assert.equal(getState(app.db, 'commandsScope:1'), 'guild:42');

  const { cleared, clear } = clearer();
  assert.equal(await syncCommands(inScope(), commands, { put, clear }), 'registered');
  assert.deepEqual(cleared, ['42']);
  assert.equal(getState(app.db, 'commandsScope:1'), 'global');
});
