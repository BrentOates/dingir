import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.ts';
import { loadEnv } from '../src/config/env.ts';
import { createShutdownRegistry } from '../src/framework/shutdown.ts';
import { createHoneypotTracker } from '../src/services/HoneypotTracker.ts';
import { createTestApp, fakeLogger, FIXED_NOW } from './helpers/app.ts';

test('createApp opens and migrates the database, and closes it on shutdown', async () => {
  const { logger, logs } = fakeLogger();
  const env = loadEnv({ TOKEN: 't', CLIENT_ID: 'c', DB_PATH: ':memory:' });
  const app = createApp({ env, logger });

  const tables = app.db.$client
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[];
  assert.ok(tables.some((t) => t.name === 'ServerConfigs'));
  assert.ok(logs.some((l) => l.message === 'Database migrations complete'));

  await app.shutdown.run();
  assert.equal(app.db.$client.open, false);
});

test('createApp keeps supplied dependencies', () => {
  const app = createTestApp();
  const again = createApp({ ...app });
  assert.equal(again.db, app.db);
  assert.equal(again.clock(), FIXED_NOW);
  app.close();
});

test('shutdown hooks run in reverse order and a failing hook does not block the rest', async () => {
  const { logger, logs } = fakeLogger();
  const registry = createShutdownRegistry(logger);
  const order: string[] = [];
  registry.register(() => void order.push('first'));
  registry.register(() => {
    throw new Error('nope');
  });
  registry.register(async () => void order.push('last'));
  await registry.run();
  assert.deepEqual(order, ['last', 'first']);
  assert.equal(logs.filter((l) => l.level === 'error').length, 1);
});

test('honeypot tracker is scoped to its own instance', () => {
  const a = createHoneypotTracker();
  const b = createHoneypotTracker();
  assert.equal(a.begin('g', 'u'), true);
  assert.equal(a.begin('g', 'u'), false);
  assert.equal(a.isActive('g', 'u'), true);
  assert.equal(b.isActive('g', 'u'), false);
  a.cancel('g', 'u');
  assert.equal(a.isActive('g', 'u'), false);
});
