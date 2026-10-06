import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DateTime } from 'luxon';
import {
  celebrationDate,
  isBirthdayToday,
  isValidBirthday,
  nextOccurrence,
  upcoming,
} from '../../src/services/BirthdayDates.ts';

const LONDON = 'Europe/London';
const at = (iso: string, zone = 'utc'): DateTime => DateTime.fromISO(iso, { zone });
const ymd = (dt: DateTime): string => dt.toISODate() ?? '';

test('isValidBirthday', () => {
  assert.equal(isValidBirthday(2, 29), true);
  assert.equal(isValidBirthday(4, 31), false);
  assert.equal(isValidBirthday(13, 1), false);
  assert.equal(isValidBirthday(1, 0), false);
  assert.equal(isValidBirthday(12, 31), true);
});

test('celebrationDate moves Feb 29 to Feb 28 in non-leap years', () => {
  assert.deepEqual(celebrationDate(2, 29, 2026), { year: 2026, month: 2, day: 28 });
  assert.deepEqual(celebrationDate(2, 29, 2027), { year: 2027, month: 2, day: 28 });
  assert.deepEqual(celebrationDate(2, 29, 2028), { year: 2028, month: 2, day: 29 });
  assert.deepEqual(celebrationDate(3, 1, 2026), { year: 2026, month: 3, day: 1 });
});

test('nextOccurrence: today counts as upcoming', () => {
  const next = nextOccurrence(6, 15, at('2026-06-15T13:00:00'), 'utc');
  assert.equal(ymd(next), '2026-06-15');
  assert.equal(next.hour, 0);
});

test('nextOccurrence: passed date rolls to next year, Dec 31 to Jan 1', () => {
  assert.equal(ymd(nextOccurrence(6, 14, at('2026-06-15T00:00:00'), 'utc')), '2027-06-14');
  assert.equal(ymd(nextOccurrence(1, 1, at('2026-12-31T23:00:00'), 'utc')), '2027-01-01');
  assert.equal(ymd(nextOccurrence(12, 31, at('2026-12-31T23:00:00'), 'utc')), '2026-12-31');
});

test('nextOccurrence: Feb 29 across leap and non-leap years', () => {
  assert.equal(ymd(nextOccurrence(2, 29, at('2026-01-10T12:00:00'), 'utc')), '2026-02-28');
  assert.equal(ymd(nextOccurrence(2, 29, at('2026-03-01T12:00:00'), 'utc')), '2027-02-28');
  assert.equal(ymd(nextOccurrence(2, 29, at('2027-03-01T12:00:00'), 'utc')), '2028-02-29');
  assert.equal(ymd(nextOccurrence(2, 29, at('2028-02-29T09:00:00'), 'utc')), '2028-02-29');
  assert.equal(ymd(nextOccurrence(2, 29, at('2028-03-01T09:00:00'), 'utc')), '2029-02-28');
});

test('isBirthdayToday handles Feb 29 on Feb 28/29', () => {
  assert.equal(isBirthdayToday(2, 29, at('2026-02-28T10:00:00'), 'utc'), true);
  assert.equal(isBirthdayToday(2, 29, at('2027-02-28T10:00:00'), 'utc'), true);
  assert.equal(isBirthdayToday(2, 29, at('2028-02-28T10:00:00'), 'utc'), false);
  assert.equal(isBirthdayToday(2, 29, at('2028-02-29T10:00:00'), 'utc'), true);
  assert.equal(isBirthdayToday(2, 29, at('2026-03-01T00:00:00'), 'utc'), false);
});

test('timezone: UTC date differs from Europe/London date (BST)', () => {
  const now = at('2026-06-14T23:30:00Z');
  assert.equal(isBirthdayToday(6, 14, now, 'utc'), true);
  assert.equal(isBirthdayToday(6, 14, now, LONDON), false);
  assert.equal(isBirthdayToday(6, 15, now, LONDON), true);
  assert.equal(ymd(nextOccurrence(6, 15, now, LONDON)), '2026-06-15');
  assert.equal(nextOccurrence(6, 15, now, LONDON).zoneName, LONDON);
});

test('timezone: Pacific/Auckland is ahead of UTC', () => {
  const now = at('2026-06-14T20:00:00Z');
  assert.equal(isBirthdayToday(6, 15, now, 'Pacific/Auckland'), true);
  assert.equal(isBirthdayToday(6, 15, now, 'utc'), false);
  assert.equal(ymd(nextOccurrence(6, 14, now, 'Pacific/Auckland')), '2027-06-14');
});

test('upcoming groups by date, sorts, and does not mutate input', () => {
  const profiles = [
    { userId: 'c', month: 7, day: 1 },
    { userId: 'b', month: 6, day: 20 },
    { userId: 'a', month: 6, day: 20 },
    { userId: 'd', month: 1, day: 5 },
    { userId: 'bad', month: 4, day: 31 },
  ];
  const copy = structuredClone(profiles);
  const result = upcoming(profiles, at('2026-06-15T12:00:00'), 'utc');
  assert.deepEqual(
    result.map((g) => [ymd(g.date), g.userIds]),
    [
      ['2026-06-20', ['a', 'b']],
      ['2026-07-01', ['c']],
      ['2027-01-05', ['d']],
    ],
  );
  assert.deepEqual(profiles, copy);
});

test('upcoming limit: stops after the group that reaches the limit, never splitting a date', () => {
  const profiles = [
    { userId: 'a', month: 6, day: 16 },
    { userId: 'b', month: 6, day: 17 },
    { userId: 'c', month: 6, day: 17 },
    { userId: 'd', month: 6, day: 18 },
  ];
  const now = at('2026-06-15T12:00:00');
  assert.deepEqual(
    upcoming(profiles, now, 'utc', 2).map((g) => g.userIds),
    [['a'], ['b', 'c']],
  );
  assert.deepEqual(
    upcoming(profiles, now, 'utc', 3).map((g) => g.userIds),
    [['a'], ['b', 'c']],
  );
  assert.equal(upcoming(profiles, now, 'utc', 4).length, 3);
  assert.deepEqual(upcoming([], now, 'utc'), []);
});
