import { pino, type DestinationStream } from 'pino';

type Context = Record<string, unknown>;

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

export const parseLogLevel = (value: string | undefined): LogLevel | undefined =>
  LOG_LEVELS.find((level) => level === value);

export interface Logger {
  debug(message: string, context?: Context, error?: unknown): void;
  info(message: string, context?: Context, error?: unknown): void;
  warn(message: string, context?: Context, error?: unknown): void;
  error(message: string, context?: Context, error?: unknown): void;
  fatal(message: string, context?: Context, error?: unknown): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  /** Defaults to stdout. */
  destination?: DestinationStream;
}

/** Structured JSON logger (pino) writing one line per entry; pipe through pino-pretty for humans. */
export const createConsoleLogger = ({
  level = DEFAULT_LOG_LEVEL,
  destination,
}: LoggerOptions = {}): Logger => {
  const base = pino(
    { level, timestamp: pino.stdTimeFunctions.isoTime, base: undefined },
    destination ?? pino.destination(1),
  );
  const at =
    (method: keyof Logger): Logger[keyof Logger] =>
    (message, context, error) => {
      const fields = error === undefined || error === null ? context : { ...context, err: error };
      if (fields) {
        base[method](fields, message);
      } else {
        base[method](message);
      }
    };
  return {
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    fatal: at('fatal'),
  };
};
