import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { Logger, formatContext } from '../src/utilities/Logger.ts';

type Method = 'log' | 'warn' | 'error';
const original = { log: console.log, warn: console.warn, error: console.error };
let lines: Record<Method, string[]>;

beforeEach(() => {
  lines = { log: [], warn: [], error: [] };
  for (const method of Object.keys(lines) as Method[]) {
    console[method] = (msg: unknown) => {
      lines[method].push(String(msg));
    };
  }
});

afterEach(() => {
  Object.assign(console, original);
});

test('writeError prints the stack for Error instances', () => {
  const err = new Error('boom');
  Logger.writeError('failed', err);
  assert.equal(lines.error.length, 2);
  assert.match(lines.error[0], /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\]: failed$/);
  assert.ok(lines.error[1].includes(err.stack as string));
});

test('writeError stringifies non-Error values and skips missing ones', () => {
  Logger.writeError('failed', 'plain text');
  Logger.writeError('failed', 42);
  Logger.writeError('failed');
  assert.equal(lines.error.length, 5);
  assert.ok(lines.error[1].endsWith(': plain text'));
  assert.ok(lines.error[3].endsWith(': 42'));
});

test('formatContext renders key=value pairs', () => {
  assert.equal(
    formatContext({ guild: '123', name: 'a b', count: 3, ok: true, none: null }),
    'guild=123 name="a b" count=3 ok=true none=null'
  );
  assert.equal(formatContext(), '');
});

test('level helpers include level, message, context and error', () => {
  Logger.info('hello', { guild: '1' });
  Logger.warn('careful');
  Logger.error('bad', { event: 'x' }, new Error('nope'));
  Logger.debug('detail');

  assert.match(lines.log[0], /INFO: hello guild=1$/);
  assert.match(lines.warn[0], /WARN: careful$/);
  assert.match(lines.error[0], /ERROR: bad event=x$/);
  assert.match(lines.error[1], /ERROR: Error: nope/);
  assert.match(lines.log[1], /DEBUG: detail$/);
});
