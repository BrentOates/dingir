import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConsoleLogger, parseLogLevel, type LogLevel } from '../src/utilities/Logger.ts';

const capture = (level?: LogLevel) => {
  const lines: string[] = [];
  const logger = createConsoleLogger({
    level,
    destination: {
      write: (line: string) => {
        lines.push(line);
      },
    },
  });
  return { logger, entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>) };
};

test('writes JSON lines with level, message and merged context', () => {
  const { logger, entries } = capture();
  logger.info('hello', { guild: '1' });
  logger.warn('careful');
  logger.fatal('dead');

  const [info, warn, fatal] = entries();
  assert.equal(info?.msg, 'hello');
  assert.equal(info?.guild, '1');
  assert.equal(info?.level, 30);
  assert.equal(typeof info?.time, 'string');
  assert.equal(warn?.msg, 'careful');
  assert.equal(warn?.level, 40);
  assert.equal(fatal?.level, 60);
});

test('serialises errors under err with a stack', () => {
  const { logger, entries } = capture();
  logger.error('bad', { event: 'x' }, new Error('nope'));
  logger.error('plain failure', undefined, 'just a string');

  const [first, second] = entries();
  const err = first?.err as { message: string; stack: string };
  assert.equal(first?.event, 'x');
  assert.equal(err.message, 'nope');
  assert.match(err.stack, /Error: nope/);
  assert.equal(second?.err, 'just a string');
});

test('respects the configured level', () => {
  const { logger, entries } = capture('warn');
  logger.debug('hidden');
  logger.info('hidden');
  logger.warn('shown');
  assert.deepEqual(
    entries().map((e) => e.msg),
    ['shown']
  );
});

test('defaults to info', () => {
  const { logger, entries } = capture();
  logger.debug('hidden');
  logger.info('shown');
  assert.equal(entries().length, 1);
});

test('parseLogLevel accepts only known levels', () => {
  assert.equal(parseLogLevel('trace'), 'trace');
  assert.equal(parseLogLevel('bogus'), undefined);
  assert.equal(parseLogLevel(undefined), undefined);
});
