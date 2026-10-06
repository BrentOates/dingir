import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { defineCommand, type Command } from '../../src/framework/command.ts';
import { commandScope, hashCommands, syncCommands } from '../../src/framework/registrar.ts';
import { getState, setState } from '../../src/services/BotState.ts';
import { apiError } from '../fakes/discord.ts';
import { createTestApp } from '../helpers/app.ts';

const app = createTestApp();

after(() => {
  app.close();
});

beforeEach(() => {
  app.db.$client.exec('DELETE FROM `BotState`');
  app.logs.length = 0;
});

const command = (name: string, description = 'd'): Command =>
  defineCommand({ name, description, run: async () => {} });

const V1 = [command('one')];
const V2 = [command('one'), command('two')];

test('hashCommands is stable and changes with command content', () => {
  const a = [command('one'), command('two')];
  assert.equal(hashCommands(a), hashCommands([command('one'), command('two')]));
  assert.notEqual(hashCommands(a), hashCommands([command('one'), command('two', 'changed')]));
  assert.notEqual(hashCommands(a), hashCommands([command('one')]));
});

test('commandScope distinguishes global and dev guild targets and applications', () => {
  const key = (devGuildId: string | undefined, clientId = '1') =>
    commandScope({ devGuildId, clientId }).stateKey;
  assert.equal(key(undefined), 'commandsHash:1:global');
  assert.equal(key('42'), 'commandsHash:1:guild:42');
  assert.equal(key(undefined, '2'), 'commandsHash:2:global');
});

type Result = 'registered' | 'unchanged' | 'failed';

interface Step {
  /** DEV_GUILD_ID for this start; undefined is the global scope. */
  dev?: string;
  commands?: readonly Command[];
  clientId?: string;
  put?: 'ok' | 'fail';
  clear?: 'ok' | 'fail' | 'unknown-guild' | 'missing-access';
  result: Result;
  puts: number;
  /** Guilds whose commands were cleared during this step. */
  cleared?: string[];
  /** BotState scope afterwards (for the step's client id). */
  scope?: string;
}

interface Row {
  name: string;
  /** Pre-existing BotState rows. */
  state?: Record<string, string>;
  steps: Step[];
  /** A warning matching this must have been logged by the last step. */
  warns?: RegExp;
}

const rows: Row[] = [
  {
    name: 'first start registers, then skips while the hash is unchanged',
    steps: [
      { result: 'registered', puts: 1, scope: 'global' },
      { result: 'unchanged', puts: 0, scope: 'global' },
      { commands: V2, result: 'registered', puts: 1, scope: 'global' },
    ],
  },
  {
    name: 'hash is tracked per scope and per application',
    steps: [
      { result: 'registered', puts: 1, scope: 'global' },
      { dev: '42', result: 'registered', puts: 1, scope: 'guild:42' },
      { dev: '42', result: 'unchanged', puts: 0, scope: 'guild:42' },
      { clientId: '2', result: 'registered', puts: 1, scope: 'global' },
      { clientId: '2', result: 'unchanged', puts: 0, scope: 'global' },
    ],
  },
  {
    name: 'a failed registration records nothing and is retried',
    steps: [
      { put: 'fail', result: 'failed', puts: 1 },
      { result: 'registered', puts: 1, scope: 'global' },
    ],
  },
  {
    name: 'hashes under the old key format are ignored',
    state: { 'commandsHash:global': 'stale' },
    steps: [{ result: 'registered', puts: 1, scope: 'global' }],
  },
  {
    name: 'a hash without a recorded scope (interrupted run) re-registers to record it',
    state: { 'commandsHash:1:global': hashCommands(V1) },
    steps: [
      { result: 'registered', puts: 1, scope: 'global' },
      { result: 'unchanged', puts: 0, scope: 'global' },
    ],
  },
  {
    name: 'dev guild to global clears the old guild',
    steps: [
      { dev: '42', result: 'registered', puts: 1, cleared: [], scope: 'guild:42' },
      { result: 'registered', puts: 1, cleared: ['42'], scope: 'global' },
    ],
  },
  {
    name: 'dev guild A to B clears A once, and staying put clears nothing more',
    steps: [
      { dev: 'A', result: 'registered', puts: 1, scope: 'guild:A' },
      { dev: 'B', result: 'registered', puts: 1, cleared: ['A'], scope: 'guild:B' },
      { dev: 'B', commands: V2, result: 'registered', puts: 1, cleared: [], scope: 'guild:B' },
    ],
  },
  {
    name: 'global to a dev guild never clears global commands and warns',
    steps: [
      { result: 'registered', puts: 1, scope: 'global' },
      { dev: '42', result: 'registered', puts: 1, cleared: [], scope: 'guild:42' },
    ],
    warns: /deploy:commands/,
  },
  {
    name: 'returning to a scope whose stored hash still matches re-registers',
    steps: [
      { dev: 'A', result: 'registered', puts: 1, scope: 'guild:A' },
      { result: 'registered', puts: 1, cleared: ['A'], scope: 'global' },
      { dev: 'A', result: 'registered', puts: 1, cleared: [], scope: 'guild:A' },
    ],
  },
  {
    name: 'a failed registration while switching clears nothing and keeps the scope',
    steps: [
      { dev: '42', result: 'registered', puts: 1, scope: 'guild:42' },
      { put: 'fail', result: 'failed', puts: 1, cleared: [], scope: 'guild:42' },
      { result: 'registered', puts: 1, cleared: ['42'], scope: 'global' },
    ],
  },
  {
    name: 'a failed cleanup keeps the old scope so every start retries it',
    steps: [
      { dev: '42', result: 'registered', puts: 1, scope: 'guild:42' },
      { clear: 'fail', result: 'registered', puts: 1, cleared: ['42'], scope: 'guild:42' },
      { clear: 'fail', result: 'registered', puts: 1, cleared: ['42'], scope: 'guild:42' },
      { result: 'registered', puts: 1, cleared: ['42'], scope: 'global' },
      { result: 'unchanged', puts: 0, scope: 'global' },
    ],
  },
  {
    name: 'a dev guild the bot has left cannot be cleared and is not retried forever',
    steps: [
      { dev: '42', result: 'registered', puts: 1, scope: 'guild:42' },
      { clear: 'unknown-guild', result: 'registered', puts: 1, cleared: ['42'], scope: 'global' },
      { result: 'unchanged', puts: 0, scope: 'global' },
    ],
  },
  {
    name: 'Missing Access on cleanup is treated the same as an unknown guild',
    steps: [
      { dev: '42', result: 'registered', puts: 1, scope: 'guild:42' },
      { clear: 'missing-access', result: 'registered', puts: 1, cleared: ['42'], scope: 'global' },
    ],
  },
];

describe('command registration state machine', () => {
  for (const row of rows) {
    test(row.name, async () => {
      for (const [key, value] of Object.entries(row.state ?? {})) {
        setState(app.db, key, value);
      }
      const hashes = new Map<string, string>();
      for (const [index, step] of row.steps.entries()) {
        let puts = 0;
        const cleared: string[] = [];
        const instance = {
          ...app,
          env: Object.freeze({ ...app.env, devGuildId: step.dev, clientId: step.clientId ?? '1' }),
        };
        app.logs.length = 0;
        const result = await syncCommands(instance, step.commands ?? V1, {
          put: async (_env, commands) => {
            puts++;
            if (step.put === 'fail') {
              throw new Error('discord down');
            }
            return commands.length;
          },
          clear: async (_env, guildId) => {
            cleared.push(guildId);
            if (step.clear === 'fail') {
              throw new Error('forbidden');
            }
            if (step.clear === 'unknown-guild') {
              throw apiError(10004);
            }
            if (step.clear === 'missing-access') {
              throw apiError(50001);
            }
          },
        });
        const at = `step ${index + 1}`;
        assert.equal(result, step.result, `${at}: result`);
        assert.equal(puts, step.puts, `${at}: register calls`);
        assert.deepEqual(cleared, step.cleared ?? [], `${at}: cleared guilds`);
        const clientId = step.clientId ?? '1';
        if ('scope' in step) {
          assert.equal(getState(app.db, `commandsScope:${clientId}`), step.scope, `${at}: scope`);
        }
        const stateKey = commandScope(instance.env).stateKey;
        if (step.result === 'failed') {
          assert.equal(
            getState(app.db, stateKey),
            hashes.get(stateKey),
            `${at}: a failed registration records no hash`,
          );
        } else {
          assert.equal(
            getState(app.db, stateKey),
            hashCommands(step.commands ?? V1),
            `${at}: hash`,
          );
          hashes.set(stateKey, hashCommands(step.commands ?? V1));
        }
      }
      if (row.warns) {
        assert.ok(app.logsAt('warn').some((e) => row.warns!.test(e.message)));
      }
    });
  }

  test('a failed registration is logged once as an error', async () => {
    const failing = async (): Promise<number> => {
      throw new Error('discord down');
    };
    assert.equal(await syncCommands(app, V1, failing), 'failed');
    assert.equal(app.logsAt('error').length, 1);
  });

  test('registering in a dev guild warns that global commands may remain', async () => {
    const dev = { ...app, env: Object.freeze({ ...app.env, devGuildId: '42' }) };
    await syncCommands(dev, V1, async (_env, commands) => commands.length);
    assert.ok(app.logsAt('warn').some((e) => /global commands may also exist/.test(e.message)));
    assert.ok(app.logsAt('warn').some((e) => /deploy:commands/.test(e.message)));
  });

  test('skipping logs that commands are unchanged', async () => {
    const put = async (_env: unknown, commands: readonly Command[]) => commands.length;
    await syncCommands(app, V1, put);
    await syncCommands(app, V1, put);
    assert.ok(app.logsAt('info').some((e) => /unchanged, skipping/.test(e.message)));
  });
});
