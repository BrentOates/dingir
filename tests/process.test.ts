import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { installProcessHandlers, type ProcessHandlerDeps } from '../src/framework/process.ts';
import { fakeLogger } from './helpers/app.ts';

const setup = (runShutdown: () => Promise<void>, timeouts = {}) => {
  const proc = new EventEmitter();
  const { logger, logs } = fakeLogger();
  const exits: number[] = [];
  const handlers = installProcessHandlers({
    proc: proc as unknown as ProcessHandlerDeps['proc'],
    logger,
    runShutdown,
    exit: (code) => {
      exits.push(code);
    },
    ...timeouts,
  });
  return { proc, logs, exits, handlers };
};

const never = (): Promise<void> => new Promise(() => {});

test('unhandled rejections are logged and do not exit', () => {
  const { proc, logs, exits } = setup(async () => {});
  proc.emit('unhandledRejection', new Error('nope'));
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.level, 'error');
  assert.deepEqual(exits, []);
});

test('uncaught exceptions log fatal, run shutdown, then exit 1', async () => {
  const order: string[] = [];
  const { logs, exits, handlers } = setup(async () => {
    order.push('shutdown');
  });
  await handlers.onUncaughtException(new Error('boom'));
  assert.equal(logs[0]?.level, 'fatal');
  assert.deepEqual(order, ['shutdown']);
  assert.deepEqual(exits, [1]);
});

test('uncaught exceptions force exit when shutdown hangs', async () => {
  const { logs, exits, handlers } = setup(never, { crashTimeoutMs: 10 });
  await handlers.onUncaughtException(new Error('boom'));
  assert.deepEqual(exits, [1]);
  assert.ok(logs.some((l) => /timed out/.test(l.message)));
});

test('signals run shutdown and exit 0, only once', async () => {
  let runs = 0;
  const { exits, handlers } = setup(async () => {
    runs += 1;
  });
  await handlers.onSignal('SIGTERM');
  await handlers.onSignal('SIGINT');
  assert.equal(runs, 1);
  assert.deepEqual(exits, [0]);
});

test('signals force exit 1 when shutdown hangs', async () => {
  const { exits, handlers } = setup(never, { signalTimeoutMs: 10 });
  await handlers.onSignal('SIGINT');
  assert.deepEqual(exits, [1]);
});

test('a throwing shutdown still exits', async () => {
  const { logs, exits, handlers } = setup(async () => {
    throw new Error('hook');
  });
  await handlers.onSignal('SIGTERM');
  assert.deepEqual(exits, [0]);
  assert.ok(logs.some((l) => l.message === 'Shutdown failed'));
});

test('real process events are wired to the handlers', () => {
  const { proc } = setup(async () => {});
  for (const event of ['unhandledRejection', 'uncaughtException', 'SIGTERM', 'SIGINT']) {
    assert.equal(proc.listenerCount(event), 1, event);
  }
});
