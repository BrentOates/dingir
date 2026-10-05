type Context = Record<string, unknown>;
type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

const timestamp = (): string => new Date().toISOString();

const formatError = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);

const formatValue = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string') {
    return /[\s="]/.test(value) || value === '' ? JSON.stringify(value) : value;
  }
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

export const formatContext = (context?: Context): string =>
  context
    ? Object.entries(context)
        .map(([key, value]) => `${key}=${formatValue(value)}`)
        .join(' ')
    : '';

export interface Logger {
  debug(message: string, context?: Context, error?: unknown): void;
  info(message: string, context?: Context, error?: unknown): void;
  warn(message: string, context?: Context, error?: unknown): void;
  error(message: string, context?: Context, error?: unknown): void;
  fatal(message: string, context?: Context, error?: unknown): void;
}

const emit = (level: Level, message: string, context?: Context, error?: unknown): void => {
  const ctx = formatContext(context);
  const line = `[${timestamp()}] ${level}: ${message}${ctx ? ` ${ctx}` : ''}`;
  const write = level === 'ERROR' || level === 'FATAL' ? console.error : level === 'WARN' ? console.warn : console.log;
  write(line);
  if (error !== undefined && error !== null) {
    write(`[${timestamp()}] ${level}: ${formatError(error)}`);
  }
};

export const createConsoleLogger = (): Logger => ({
  debug: (message, context, error) => emit('DEBUG', message, context, error),
  info: (message, context, error) => emit('INFO', message, context, error),
  warn: (message, context, error) => emit('WARN', message, context, error),
  error: (message, context, error) => emit('ERROR', message, context, error),
  fatal: (message, context, error) => emit('FATAL', message, context, error),
});
