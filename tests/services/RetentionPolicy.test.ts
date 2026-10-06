import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type AccessState,
  classifyGuildFetchError,
  nextAccessState,
} from '../../src/services/RetentionPolicy.ts';

const policy = { minFailures: 3, graceDays: 7 };
const day = (n: number): Date => new Date(Date.UTC(2026, 0, 1 + n));
const fresh: AccessState = { accessFailureCount: 0, firstAccessFailureAt: null };

test('classifyGuildFetchError checks code structurally', () => {
  assert.equal(classifyGuildFetchError({ code: 50001 }), 'gone');
  assert.equal(classifyGuildFetchError({ code: 10004 }), 'gone');
  assert.equal(classifyGuildFetchError({ code: 500 }), 'transient');
  assert.equal(classifyGuildFetchError(new Error('ECONNRESET')), 'transient');
  assert.equal(classifyGuildFetchError(null), 'transient');
  assert.equal(classifyGuildFetchError('50001'), 'transient');
});

test('single failure sets first-failure and does not purge', () => {
  const next = nextAccessState(fresh, 'gone', day(0), policy);
  assert.deepEqual(next, { accessFailureCount: 1, firstAccessFailureAt: day(0), purge: false });
});

test('enough failures but inside grace period does not purge', () => {
  let state = fresh;
  for (let i = 0; i < 5; i += 1) {
    const next = nextAccessState(state, 'gone', day(i), policy);
    assert.equal(next.purge, false);
    state = next;
  }
  assert.equal(state.accessFailureCount, 5);
});

test('min failures and grace days both met purges', () => {
  const state: AccessState = { accessFailureCount: 2, firstAccessFailureAt: day(0) };
  const next = nextAccessState(state, 'gone', day(7), policy);
  assert.equal(next.accessFailureCount, 3);
  assert.equal(next.purge, true);
  assert.deepEqual(next.firstAccessFailureAt, day(0));
});

test('grace days elapsed but too few failures does not purge', () => {
  const state: AccessState = { accessFailureCount: 1, firstAccessFailureAt: day(0) };
  assert.equal(nextAccessState(state, 'gone', day(30), policy).purge, false);
});

test('ok resets state', () => {
  const state: AccessState = { accessFailureCount: 9, firstAccessFailureAt: day(0) };
  assert.deepEqual(nextAccessState(state, 'ok', day(40), policy), {
    accessFailureCount: 0,
    firstAccessFailureAt: null,
    purge: false,
  });
});

test('transient leaves state unchanged and never purges', () => {
  const state: AccessState = { accessFailureCount: 9, firstAccessFailureAt: day(0) };
  assert.deepEqual(nextAccessState(state, 'transient', day(40), policy), {
    ...state,
    purge: false,
  });
});
