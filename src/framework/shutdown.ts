import type { Logger } from '../utilities/Logger.ts';

export type ShutdownHook = () => Promise<void> | void;

export interface ShutdownRegistry {
  register(hook: ShutdownHook): void;
  /** Runs hooks in reverse registration order; a failing hook never blocks the rest. */
  run(): Promise<void>;
}

export function createShutdownRegistry(logger: Logger): ShutdownRegistry {
  const hooks: ShutdownHook[] = [];
  return {
    register: (hook) => {
      hooks.push(hook);
    },
    run: async () => {
      for (const hook of [...hooks].reverse()) {
        try {
          await hook();
        } catch (error) {
          logger.error('Shutdown hook failed', undefined, error);
        }
      }
    },
  };
}
