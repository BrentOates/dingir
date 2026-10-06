import { createApp, type App } from '../../src/app.ts';
import { loadEnv } from '../../src/config/env.ts';
import { openDb } from '../../src/db/db.ts';
import { migrate } from '../../src/db/migrator.ts';
import type { Logger } from '../../src/utilities/Logger.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: unknown;
}

export interface TestApp extends App {
  /** Every entry written through app.logger, in order. */
  logs: LogEntry[];
  /** Entries at one level, for concise assertions. */
  logsAt(level: LogLevel): LogEntry[];
  close(): void;
}

export const FIXED_NOW = new Date('2027-01-15T12:00:00Z');

export function fakeLogger(): { logger: Logger; logs: LogEntry[] } {
  const logs: LogEntry[] = [];
  const at =
    (level: LogLevel): Logger[LogLevel] =>
    (message, context, error) => {
      logs.push({ level, message, context, error });
    };
  return {
    logger: {
      debug: at('debug'),
      info: at('info'),
      warn: at('warn'),
      error: at('error'),
      fatal: at('fatal'),
    },
    logs,
  };
}

/** An App backed by a fresh in-memory migrated database, a capturing logger and a fixed clock. */
export function createTestApp(overrides: Partial<App> = {}): TestApp {
  const { logger, logs } = fakeLogger();
  const env =
    overrides.env ??
    loadEnv({
      TOKEN: 'test-token',
      CLIENT_ID: '1',
      DB_PATH: ':memory:',
      BOT_TIMEZONE: 'Europe/London',
    });
  const db = overrides.db ?? openDb(':memory:');
  if (!overrides.db) {
    migrate(db.$client, overrides.logger ?? logger);
  }
  const app = createApp({
    env,
    db,
    logger,
    clock: () => FIXED_NOW,
    ...overrides,
  });
  return Object.assign(app, {
    logs,
    logsAt: (level: LogLevel) => logs.filter((entry) => entry.level === level),
    close: () => db.$client.close(),
  });
}
