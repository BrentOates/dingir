import { DateTime } from 'luxon';

export interface BirthdayProfile {
  userId: string;
  month: number;
  day: number;
}

export interface UpcomingGroup {
  date: DateTime;
  userIds: string[];
}

export const isValidBirthday = (month: number, day: number): boolean =>
  Number.isInteger(month) &&
  Number.isInteger(day) &&
  DateTime.fromObject({ year: 2024, month, day }, { zone: 'utc' }).isValid;

export const celebrationDate = (
  month: number,
  day: number,
  year: number
): { year: number; month: number; day: number } => {
  if (month === 2 && day === 29 && !DateTime.utc(year).isInLeapYear) {
    return { year, month: 2, day: 28 };
  }
  return { year, month, day };
};

const startOfToday = (now: DateTime, zone: string): DateTime => now.setZone(zone).startOf('day');

export const nextOccurrence = (
  month: number,
  day: number,
  now: DateTime,
  zone: string
): DateTime => {
  const start = startOfToday(now, zone);
  for (let year = start.year; year <= start.year + 8; year += 1) {
    const candidate = DateTime.fromObject(celebrationDate(month, day, year), { zone });
    if (candidate >= start) {
      return candidate;
    }
  }
  throw new Error(`No occurrence found for ${month}/${day}`);
};

export const isBirthdayToday = (
  month: number,
  day: number,
  now: DateTime,
  zone: string
): boolean => {
  const start = startOfToday(now, zone);
  const celebration = celebrationDate(month, day, start.year);
  return start.month === celebration.month && start.day === celebration.day;
};

/** Groups share a date and are never split: the group that crosses `limit` is included in full. */
export const upcoming = (
  profiles: readonly BirthdayProfile[],
  now: DateTime,
  zone: string,
  limit = 10
): UpcomingGroup[] => {
  const byDate = new Map<number, UpcomingGroup>();
  for (const profile of profiles) {
    if (!isValidBirthday(profile.month, profile.day)) {
      continue;
    }
    const date = nextOccurrence(profile.month, profile.day, now, zone);
    const key = date.toMillis();
    const group = byDate.get(key) ?? { date, userIds: [] };
    group.userIds.push(profile.userId);
    byDate.set(key, group);
  }

  const groups = [...byDate.values()].sort((a, b) => a.date.toMillis() - b.date.toMillis());
  const result: UpcomingGroup[] = [];
  let total = 0;
  for (const group of groups) {
    if (total >= limit) {
      break;
    }
    group.userIds.sort();
    result.push(group);
    total += group.userIds.length;
  }
  return result;
};
