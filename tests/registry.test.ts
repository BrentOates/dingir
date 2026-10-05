import assert from 'node:assert/strict';
import { test } from 'node:test';
import { events } from '../src/events/index.ts';
import { validateRegistry } from '../src/framework/registry.ts';
import { commands } from '../src/commands/index.ts';

test('validateRegistry accepts unique names', () => {
  assert.doesNotThrow(() => validateRegistry('command', [{ name: 'a' }, { name: 'b' }]));
});

test('validateRegistry rejects duplicate names', () => {
  assert.throws(() => validateRegistry('command', [{ name: 'same' }, { name: 'same' }]), /Duplicate command "same"/);
  assert.throws(() => validateRegistry('event', [{ name: 'x' }, { name: 'x' }]), /Duplicate event "x"/);
});

test('validateRegistry rejects missing names', () => {
  assert.throws(() => validateRegistry('command', [{ name: '' }]), /non-empty name/);
});

test('the real command registry is valid and shaped correctly', () => {
  validateRegistry('command', commands);
  assert.ok(commands.length > 0);
  for (const command of commands) {
    assert.equal(typeof command.toJSON, 'function');
    assert.equal(typeof command.resolve, 'function');
  }
});

test('the real event registry is valid and shaped correctly', () => {
  validateRegistry('event', events);
  assert.ok(events.length > 0);
  for (const event of events) {
    assert.equal(typeof event.run, 'function');
  }
});
