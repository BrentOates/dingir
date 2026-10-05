import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEnv } from '../src/config/env';

const valid = { TOKEN: 'abc', CLIENT_ID: '123' };

test('applies defaults when only required variables are set', () => {
  const env = loadEnv(valid);
  assert.equal(env.token, 'abc');
  assert.equal(env.clientId, '123');
  assert.equal(env.jobSchedule, '0 9 * * *');
  assert.equal(env.timezone, 'Europe/London');
  assert.equal(env.dbPath, 'data/dingir.sqlite');
  assert.equal(env.purgeMinFailures, 3);
  assert.equal(env.purgeGraceDays, 7);
  assert.equal(env.devGuildId, undefined);
});

test('returns a frozen object', () => {
  assert.ok(Object.isFrozen(loadEnv(valid)));
});

test('parses overrides', () => {
  const env = loadEnv({
    ...valid,
    JOB_SCHEDULE: '*/5 * * * * *',
    BOT_TIMEZONE: 'America/New_York',
    DB_PATH: ':memory:',
    PURGE_MIN_FAILURES: '5',
    PURGE_GRACE_DAYS: '0',
    DEV_GUILD_ID: '999',
  });
  assert.equal(env.jobSchedule, '*/5 * * * * *');
  assert.equal(env.timezone, 'America/New_York');
  assert.equal(env.dbPath, ':memory:');
  assert.equal(env.purgeMinFailures, 5);
  assert.equal(env.purgeGraceDays, 0);
  assert.equal(env.devGuildId, '999');
});

test('treats blank values as unset', () => {
  const env = loadEnv({ ...valid, JOB_SCHEDULE: '  ', DEV_GUILD_ID: '' });
  assert.equal(env.jobSchedule, '0 9 * * *');
  assert.equal(env.devGuildId, undefined);
});

test('reports every problem in a single error', () => {
  assert.throws(
    () =>
      loadEnv({
        JOB_SCHEDULE: 'every day',
        BOT_TIMEZONE: 'Mars/Olympus',
        PURGE_MIN_FAILURES: '0',
        PURGE_GRACE_DAYS: '-1',
      }),
    (err: Error) => {
      for (const expected of [
        'TOKEN',
        'CLIENT_ID',
        'JOB_SCHEDULE',
        'BOT_TIMEZONE',
        'PURGE_MIN_FAILURES',
        'PURGE_GRACE_DAYS',
      ]) {
        assert.match(err.message, new RegExp(expected));
      }
      return true;
    }
  );
});

test('rejects malformed cron strings', () => {
  for (const schedule of ['* * * *', '* * * * * * *', '0 9 * * ;']) {
    assert.throws(() => loadEnv({ ...valid, JOB_SCHEDULE: schedule }), /JOB_SCHEDULE/);
  }
});

test('rejects non-integer purge settings', () => {
  assert.throws(() => loadEnv({ ...valid, PURGE_MIN_FAILURES: '2.5' }), /PURGE_MIN_FAILURES/);
  assert.throws(() => loadEnv({ ...valid, PURGE_GRACE_DAYS: 'abc' }), /PURGE_GRACE_DAYS/);
});
