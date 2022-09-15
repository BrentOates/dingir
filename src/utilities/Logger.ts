import { DateTime } from 'luxon';

export class Logger {
  public static writeLog(log: string): void {
    console.log(
      `[${DateTime.local().toLocaleString(DateTime.DATETIME_SHORT)}]: ${log}`
    );
  }

  public static writeError(log: string, error?: string): void {
    console.error(
      `[${DateTime.local().toLocaleString(DateTime.DATETIME_SHORT)}]: ${log}`
    );
    if (error) {
      console.error(
        `[${DateTime.local().toLocaleString(
          DateTime.DATETIME_SHORT
        )}]: ${error}`
      );
    }
  }
}
