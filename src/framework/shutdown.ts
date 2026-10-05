import { Logger } from '../utilities/Logger';

type ShutdownHook = () => Promise<void> | void;

const hooks: ShutdownHook[] = [];

export function registerShutdownHook(hook: ShutdownHook): void {
  hooks.push(hook);
}

/** Runs hooks in reverse registration order; a failing hook never blocks the rest. */
export async function runShutdownHooks(): Promise<void> {
  for (const hook of [...hooks].reverse()) {
    try {
      await hook();
    } catch (error) {
      Logger.error('Shutdown hook failed', undefined, error);
    }
  }
}
