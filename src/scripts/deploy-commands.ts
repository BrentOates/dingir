import { commands } from '../commands/index.ts';
import { createApp } from '../app.ts';
import { loadEnv } from '../config/env.ts';
import { commandScope, registerCommands } from '../framework/registrar.ts';
import { validateRegistry } from '../framework/registry.ts';
import { createConsoleLogger, parseLogLevel } from '../utilities/Logger.ts';

const logger = createConsoleLogger({ level: parseLogLevel(process.env.LOG_LEVEL?.trim()) });

let app: ReturnType<typeof createApp> | undefined;
try {
  const env = loadEnv();
  validateRegistry('command', commands);
  const { label } = commandScope(env);
  app = createApp({ env, logger });
  logger.info(`Deploying ${commands.length} application commands ${label}`);
  const count = await registerCommands(app, commands);
  logger.info(`Deployed ${count} application commands ${label}`);
} catch (error) {
  logger.error('Command deployment failed', undefined, error);
  process.exitCode = 1;
} finally {
  app?.db.$client.close();
}
