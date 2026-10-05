import { type App, createApp } from './app.ts';
import { DingirClient } from './client/DingirClient.ts';
import { type Env, loadEnv } from './config/env.ts';
import { installProcessHandlers } from './framework/process.ts';
import { createConsoleLogger } from './utilities/Logger.ts';

const logger = createConsoleLogger();
let app: App | undefined;

installProcessHandlers({
  proc: process,
  logger,
  runShutdown: async () => app?.shutdown.run(),
  exit: (code) => process.exit(code),
});

async function main(): Promise<void> {
  let env: Env;
  try {
    env = loadEnv();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    logger.error('Invalid configuration, shutting down.');
    process.exit(1);
  }

  app = createApp({ env, logger });
  await new DingirClient(app).start();
}

main().catch((error: unknown) => {
  logger.fatal('Fatal error during startup.', undefined, error);
  process.exit(1);
});
