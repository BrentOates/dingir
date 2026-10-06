import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitMessage, toRepoUrl, formatUptime } from '../src/utilities/format.ts';

test('toRepoUrl', async (t) => {
  await t.test('removes git+ prefix', () => {
    assert.equal(
      toRepoUrl('git+https://github.com/BrentOates/dingir.git'),
      'https://github.com/BrentOates/dingir',
    );
  });

  await t.test('removes .git suffix', () => {
    assert.equal(
      toRepoUrl('https://github.com/BrentOates/dingir.git'),
      'https://github.com/BrentOates/dingir',
    );
  });

  await t.test('leaves URL unchanged if no prefix or suffix', () => {
    assert.equal(
      toRepoUrl('https://github.com/BrentOates/dingir'),
      'https://github.com/BrentOates/dingir',
    );
  });

  await t.test('removes both git+ prefix and .git suffix', () => {
    assert.equal(
      toRepoUrl('git+https://github.com/BrentOates/dingir.git'),
      'https://github.com/BrentOates/dingir',
    );
  });
});

test('formatUptime', async (t) => {
  await t.test('returns "unknown" for null', () => {
    assert.equal(formatUptime(null), 'unknown');
  });

  await t.test('returns "0m" for 0', () => {
    assert.equal(formatUptime(0), '0m');
  });

  await t.test('returns "0m" for 59 seconds', () => {
    assert.equal(formatUptime(59000), '0m');
  });

  await t.test('returns "1m" for 1 minute', () => {
    assert.equal(formatUptime(60000), '1m');
  });

  await t.test('returns "1h 0m" for 1 hour', () => {
    assert.equal(formatUptime(3600000), '1h 0m');
  });

  await t.test('returns "3d 4h 12m" for 3 days 4 hours 12 minutes', () => {
    const ms = 3 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000 + 12 * 60 * 1000;
    assert.equal(formatUptime(ms), '3d 4h 12m');
  });
});

test('fitMessage never splits a surrogate pair', () => {
  const out = fitMessage('Prefix:  ', 'a' + '😀'.repeat(1500));
  assert.ok(out.isWellFormed());
  assert.ok(out.length <= 2000);
});
