import { loadEnv, type Env } from './config/env.ts';
import { openDb, type Db } from './db/db.ts';
import { migrate } from './db/migrator.ts';
import { createShutdownRegistry, type ShutdownRegistry } from './framework/shutdown.ts';
import { type ConfigCache, createConfigCache } from './services/ConfigService.ts';
import { createHoneypotTracker, type HoneypotTracker } from './services/HoneypotTracker.ts';
import { createConsoleLogger, type Logger } from './utilities/Logger.ts';

/** Everything the bot's handlers and services depend on, built once at startup. */
export interface App {
  env: Readonly<Env>;
  db: Db;
  logger: Logger;
  clock: () => Date;
  honeypot: HoneypotTracker;
  configCache: ConfigCache;
  shutdown: ShutdownRegistry;
}

/** Builds the app, opening and migrating the database unless one is supplied. */
export function createApp(overrides: Partial<App> = {}): App {
  const env = overrides.env ?? loadEnv();
  const logger = overrides.logger ?? createConsoleLogger({ level: env.logLevel });
  const shutdown = overrides.shutdown ?? createShutdownRegistry(logger);

  let db = overrides.db;
  if (!db) {
    const opened = openDb(env.dbPath);
    const applied = migrate(opened.$client, logger);
    logger.info('Database migrations complete', { applied: applied.length ? applied : 'none' });
    shutdown.register(() => {
      opened.$client.close();
    });
    db = opened;
  }

  return {
    env,
    db,
    logger,
    clock: overrides.clock ?? (() => new Date()),
    honeypot: overrides.honeypot ?? createHoneypotTracker(),
    configCache: overrides.configCache ?? createConfigCache(),
    shutdown,
  };
}
