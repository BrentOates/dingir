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

/** Returns the item at `index`, failing the test if the list is shorter. */
export function nth<T>(items: readonly T[] | undefined, index = 0): T {
  const item = items?.[index];
  assert.ok(item !== undefined, `expected an item at index ${index}`);
  return item;
}

/** Returns the last item, failing the test if the list is empty. */
export const last = <T>(items: readonly T[]): T => nth(items, items.length - 1);

/** Returns a payload's text content, failing the test if it has none. */
export function contentOf(payload: { content?: string | null }): string {
  assert.equal(typeof payload.content, 'string', 'expected payload content');
  return payload.content as string;
}

/** The subset of an application command option's JSON that tests inspect. */
export interface OptionJson {
  name: string;
  required?: boolean;
  max_length?: number;
  channel_types?: number[];
  options?: OptionJson[];
}

/** Finds a named option in a command's (or option's) JSON, failing the test if absent. */
export function optionNamed(parent: { options?: unknown }, name: string): OptionJson {
  const found = ((parent.options ?? []) as OptionJson[]).find((o) => o.name === name);
  assert.ok(found, `no option named "${name}"`);
  return found;
}

/** The first top-level option of a command's JSON. */
export const firstOption = (json: { options?: unknown }): OptionJson =>
  nth(json.options as OptionJson[] | undefined);
