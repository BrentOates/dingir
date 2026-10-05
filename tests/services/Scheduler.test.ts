import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ScheduleFn, Scheduler } from '../../src/services/Scheduler';

const silence = (): void => {
  console.warn = (): void => undefined;
  console.error = (): void => undefined;
};
silence();

const fakeSchedule = (): { fn: ScheduleFn; calls: unknown[]; cancelled: () => number; fire: () => void } => {
  const calls: unknown[] = [];
  let cancels = 0;
  let cb: () => void = () => undefined;
  const fn: ScheduleFn = (spec, callback) => {
    calls.push(spec);
    cb = callback;
    return { cancel: () => (cancels += 1), nextInvocation: () => new Date(0) };
  };
  return { fn, calls, cancelled: () => cancels, fire: () => cb() };
};

test('tasks run sequentially in order with error isolation', async () => {
  const order: string[] = [];
  const scheduler = new Scheduler('0 0 * * *', 'utc', [
    { name: 'a', run: async () => void order.push('a') },
    {
      name: 'boom',
      run: async () => {
        order.push('boom');
        throw new Error('fail');
      },
    },
    { name: 'c', run: async () => void order.push('c') },
  ]);
  await scheduler.runNow();
  assert.deepEqual(order, ['a', 'boom', 'c']);
});

test('overlapping runNow is skipped, then allowed again', async () => {
  let runs = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const scheduler = new Scheduler('0 0 * * *', 'utc', [
    {
      name: 'slow',
      run: async () => {
        runs += 1;
        await gate;
      },
    },
  ]);
  const first = scheduler.runNow();
  await scheduler.runNow();
  assert.equal(runs, 1);
  release();
  await first;
  await scheduler.runNow();
  assert.equal(runs, 2);
});

test('start schedules with cron and tz; second start is a no-op', () => {
  const fake = fakeSchedule();
  const scheduler = new Scheduler('0 9 * * *', 'Europe/London', [], fake.fn);
  scheduler.start();
  scheduler.start();
  assert.deepEqual(fake.calls, [{ rule: '0 9 * * *', tz: 'Europe/London' }]);
  assert.deepEqual(scheduler.nextInvocation(), new Date(0));
});

test('fired job triggers tasks', async () => {
  const fake = fakeSchedule();
  let ran = 0;
  const scheduler = new Scheduler('* * * * *', 'utc', [{ name: 't', run: async () => void (ran += 1) }], fake.fn);
  scheduler.start();
  fake.fire();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ran, 1);
});

test('start throws when the schedule is invalid', () => {
  const scheduler = new Scheduler('nope', 'utc', [], () => null);
  assert.throws(() => scheduler.start(), /Invalid cron/);
});

test('stop cancels the job and clears nextInvocation', () => {
  const fake = fakeSchedule();
  const scheduler = new Scheduler('* * * * *', 'utc', [], fake.fn);
  scheduler.start();
  scheduler.stop();
  assert.equal(fake.cancelled(), 1);
  assert.equal(scheduler.nextInvocation(), null);
  scheduler.start();
  assert.equal(fake.calls.length, 2);
});

test('real node-schedule rejects an invalid cron string', () => {
  const scheduler = new Scheduler('not a cron', 'utc', []);
  assert.throws(() => scheduler.start());
});
