import { createApp } from './app.ts';
import { DingirClient } from './client/DingirClient.ts';
import { type Env, loadEnv } from './config/env.ts';
import { createConsoleLogger } from './utilities/Logger.ts';

const logger = createConsoleLogger();

async function main(): Promise<void> {
  let env: Env;
  try {
    env = loadEnv();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    logger.error('Invalid configuration, shutting down.');
    process.exit(1);
  }

  const app = createApp({ env, logger });
  await new DingirClient(app).start();
}

main().catch((error: unknown) => {
  logger.error('Fatal error during startup.', undefined, error);
  process.exit(1);
});
