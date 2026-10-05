type Context = Record<string, unknown>;
type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

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

export class Logger {
  public static writeLog(log: string): void {
    console.log(`[${timestamp()}]: ${log}`);
  }

  public static writeError(log: string, error?: unknown): void {
    console.error(`[${timestamp()}]: ${log}`);
    if (error !== undefined && error !== null && error !== '') {
      console.error(`[${timestamp()}]: ${formatError(error)}`);
    }
  }

  public static debug(message: string, context?: Context, error?: unknown): void {
    Logger.emit('DEBUG', message, context, error);
  }

  public static info(message: string, context?: Context, error?: unknown): void {
    Logger.emit('INFO', message, context, error);
  }

  public static warn(message: string, context?: Context, error?: unknown): void {
    Logger.emit('WARN', message, context, error);
  }

  public static error(message: string, context?: Context, error?: unknown): void {
    Logger.emit('ERROR', message, context, error);
  }

  private static emit(level: Level, message: string, context?: Context, error?: unknown): void {
    const ctx = formatContext(context);
    const line = `[${timestamp()}] ${level}: ${message}${ctx ? ` ${ctx}` : ''}`;
    const write = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
    write(line);
    if (error !== undefined && error !== null) {
      write(`[${timestamp()}] ${level}: ${formatError(error)}`);
    }
  }
}
