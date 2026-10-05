import { commands } from '../commands/index.ts';
import { loadEnv } from '../config/env.ts';
import { commandScope, putCommands } from '../framework/registrar.ts';
import { validateRegistry } from '../framework/registry.ts';
import { createConsoleLogger, parseLogLevel } from '../utilities/Logger.ts';

const logger = createConsoleLogger({ level: parseLogLevel(process.env.LOG_LEVEL?.trim()) });

try {
  const env = loadEnv();
  validateRegistry('command', commands);
  const { label } = commandScope(env);
  logger.info(`Deploying ${commands.length} application commands ${label}`);
  const count = await putCommands(env, commands);
  logger.info(`Deployed ${count} application commands ${label}`);
} catch (error) {
  logger.error('Command deployment failed', undefined, error);
  process.exitCode = 1;
}
