import { initEnv } from './config/env.ts';
import { Logger } from './utilities/Logger.ts';

async function main(): Promise<void> {
  try {
    initEnv();
  } catch (error) {
    Logger.writeError(error instanceof Error ? error.message : String(error));
    Logger.writeError('Invalid configuration, shutting down.');
    process.exit(1);
  }

  const { DingirClient } = await import('./client/DingirClient.ts');
  const dingirClient = new DingirClient();
  await dingirClient.start();
}

main().catch((error: unknown) => {
  Logger.writeError('Fatal error during startup.', error);
  process.exit(1);
});
