import type { Logger } from '../utilities/Logger.ts';

export interface ProcessHandlerDeps {
  proc: Pick<NodeJS.Process, 'on'>;
  logger: Logger;
  /** Runs the registered shutdown hooks; called lazily because the app may not exist yet. */
  runShutdown: () => Promise<void>;
  exit: (code: number) => void;
  /** How long shutdown hooks may take after an uncaught exception. */
  crashTimeoutMs?: number;
  /** How long shutdown hooks may take after SIGTERM/SIGINT. */
  signalTimeoutMs?: number;
}

export interface ProcessHandlers {
  onUnhandledRejection: (reason: unknown) => void;
  onUncaughtException: (error: unknown) => Promise<void>;
  onSignal: (signal: string) => Promise<void>;
}

/** Resolves true if `run` finished (even by throwing) before the timeout, false if it timed out. */
async function runBounded(run: () => Promise<void>, ms: number, logger: Logger): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  const finished = run().then(
    () => true as const,
    (error: unknown) => {
      logger.error('Shutdown failed', undefined, error);
      return true as const;
    }
  );
  try {
    return await Promise.race([finished, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Registers process-wide crash and signal handlers; call before anything else runs. */
export function installProcessHandlers(deps: ProcessHandlerDeps): ProcessHandlers {
  const { proc, logger, runShutdown, exit } = deps;
  const crashTimeoutMs = deps.crashTimeoutMs ?? 5_000;
  const signalTimeoutMs = deps.signalTimeoutMs ?? 10_000;
  let stopping = false;

  const handlers: ProcessHandlers = {
    onUnhandledRejection: (reason) => {
      logger.error('Unhandled promise rejection', undefined, reason);
    },
    onUncaughtException: async (error) => {
      if (stopping) {
        return;
      }
      stopping = true;
      logger.fatal('Uncaught exception, shutting down', undefined, error);
      if (!(await runBounded(runShutdown, crashTimeoutMs, logger))) {
        logger.error('Shutdown hooks timed out, forcing exit', { timeoutMs: crashTimeoutMs });
      }
      exit(1);
    },
    onSignal: async (signal) => {
      if (stopping) {
        return;
      }
      stopping = true;
      logger.info(`${signal} received, shutting down`);
      if (await runBounded(runShutdown, signalTimeoutMs, logger)) {
        exit(0);
      } else {
        logger.error('Shutdown hooks timed out, forcing exit', { timeoutMs: signalTimeoutMs });
        exit(1);
      }
    },
  };

  proc.on('unhandledRejection', handlers.onUnhandledRejection);
  proc.on('uncaughtException', (error) => {
    void handlers.onUncaughtException(error);
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    proc.on(signal, () => {
      void handlers.onSignal(signal);
    });
  }
  return handlers;
}
