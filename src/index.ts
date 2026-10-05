import 'dotenv/config';
import { initEnv } from './config/env';
import { Logger } from './utilities/Logger';

async function main(): Promise<void> {
  try {
    initEnv();
  } catch (error) {
    Logger.writeError(error instanceof Error ? error.message : String(error));
    Logger.writeError('Invalid configuration, shutting down.');
    process.exit(1);
  }

  const { NovaClient } = await import('./client/NovaClient.js');
  const novaClient = new NovaClient();
  await novaClient.start();
}

main().catch((error: unknown) => {
  Logger.writeError('Fatal error during startup.', error);
  process.exit(1);
});
