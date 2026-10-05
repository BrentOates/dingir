import assert from 'node:assert/strict';
import { UserError } from '../../src/framework/errors.ts';

/** Asserts the promise rejects with a UserError whose message matches. */
export const rejectsUserError = (promise: Promise<unknown>, message: string | RegExp): Promise<void> =>
  assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof UserError, `expected UserError, got ${String(error)}`);
    if (typeof message === 'string') {
      assert.equal(error.message, message);
    } else {
      assert.match(error.message, message);
    }
    return true;
  });
