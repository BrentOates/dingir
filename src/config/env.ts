import { IANAZone } from 'luxon';

export interface Env {
  readonly token: string;
  readonly clientId: string;
  readonly jobSchedule: string;
  readonly timezone: string;
  readonly dbPath: string;
  readonly purgeMinFailures: number;
  readonly purgeGraceDays: number;
  readonly devGuildId?: string;
}

type Source = Record<string, string | undefined>;

const CRON_FIELD = /^[\w*/,?#-]+$/;

function parseInteger(value: string, min: number): number | undefined {
  if (!/^-?\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min ? parsed : undefined;
}

export function loadEnv(source: Source = process.env): Readonly<Env> {
  const problems: string[] = [];
  const read = (key: string): string | undefined => {
    const value = source[key]?.trim();
    return value ? value : undefined;
  };
  const required = (key: string): string => {
    const value = read(key);
    if (!value) {
      problems.push(`${key} is required`);
    }
    return value ?? '';
  };

  const token = required('TOKEN');
  const clientId = required('CLIENT_ID');

  const jobSchedule = read('JOB_SCHEDULE') ?? '0 9 * * *';
  const cronFields = jobSchedule.split(/\s+/);
  if (
    (cronFields.length !== 5 && cronFields.length !== 6) ||
    !cronFields.every((field) => CRON_FIELD.test(field))
  ) {
    problems.push(`JOB_SCHEDULE must be a 5- or 6-field cron expression (got "${jobSchedule}")`);
  }

  const timezone = read('BOT_TIMEZONE') ?? 'Europe/London';
  if (!IANAZone.isValidZone(timezone)) {
    problems.push(`BOT_TIMEZONE must be a valid IANA time zone (got "${timezone}")`);
  }

  const dbPath = read('DB_PATH') ?? 'data/dingir.sqlite';

  let purgeMinFailures = 3;
  const rawFailures = read('PURGE_MIN_FAILURES');
  if (rawFailures !== undefined) {
    const parsed = parseInteger(rawFailures, 1);
    if (parsed === undefined) {
      problems.push(`PURGE_MIN_FAILURES must be an integer >= 1 (got "${rawFailures}")`);
    } else {
      purgeMinFailures = parsed;
    }
  }

  let purgeGraceDays = 7;
  const rawGrace = read('PURGE_GRACE_DAYS');
  if (rawGrace !== undefined) {
    const parsed = parseInteger(rawGrace, 0);
    if (parsed === undefined) {
      problems.push(`PURGE_GRACE_DAYS must be an integer >= 0 (got "${rawGrace}")`);
    } else {
      purgeGraceDays = parsed;
    }
  }

  const devGuildId = read('DEV_GUILD_ID');

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n - ${problems.join('\n - ')}`);
  }

  return Object.freeze({
    token,
    clientId,
    jobSchedule,
    timezone,
    dbPath,
    purgeMinFailures,
    purgeGraceDays,
    devGuildId,
  });
}
