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

  const { NovaClient } = await import('./client/NovaClient.ts');
  const novaClient = new NovaClient();
  await novaClient.start();
}

main().catch((error: unknown) => {
  Logger.writeError('Fatal error during startup.', error);
  process.exit(1);
});
