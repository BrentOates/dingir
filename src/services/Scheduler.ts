import { Cron } from 'croner';
import type { Logger } from '../utilities/Logger.ts';

export interface SchedulerTask {
  name: string;
  run: () => Promise<void>;
}

export interface ScheduledJobLike {
  cancel(): unknown;
  nextInvocation(): { toDate(): Date } | Date | null | undefined;
}

export type ScheduleFn = (
  spec: { rule: string; tz: string },
  callback: () => void
) => ScheduledJobLike | null;

const defaultScheduleFn: ScheduleFn = (spec, callback) => {
  try {
    const job = new Cron(spec.rule, { timezone: spec.tz, protect: true }, callback);
    return { cancel: () => job.stop(), nextInvocation: () => job.nextRun() };
  } catch {
    return null;
  }
};

export class Scheduler {
  private job: ScheduledJobLike | null = null;
  private readonly logger: Logger;
  private current: Promise<void> | null = null;
  private readonly cron: string;
  private readonly timezone: string;
  private readonly tasks: SchedulerTask[];
  private readonly scheduleFn: ScheduleFn;

  public constructor(
    logger: Logger,
    cron: string,
    timezone: string,
    tasks: SchedulerTask[],
    scheduleFn: ScheduleFn = defaultScheduleFn
  ) {
    this.logger = logger;
    this.cron = cron;
    this.timezone = timezone;
    this.tasks = tasks;
    this.scheduleFn = scheduleFn;
  }

  public start(): void {
    if (this.job) {
      this.logger.warn('Scheduler already started', { cron: this.cron });
      return;
    }
    const job = this.scheduleFn({ rule: this.cron, tz: this.timezone }, () => {
      void this.runNow();
    });
    if (!job) {
      throw new Error(`Invalid cron schedule "${this.cron}" (timezone ${this.timezone})`);
    }
    this.job = job;
  }

  /** Cancels future runs and waits for any in-flight run to finish. */
  public async stop(): Promise<void> {
    this.job?.cancel();
    this.job = null;
    await this.current;
  }

  public async runNow(): Promise<void> {
    if (this.current) {
      this.logger.warn('Scheduled run skipped; previous run still in progress');
      return;
    }
    const run = this.runTasks();
    this.current = run;
    try {
      await run;
    } finally {
      this.current = null;
    }
  }

  private async runTasks(): Promise<void> {
    for (const task of this.tasks) {
      try {
        await task.run();
      } catch (error) {
        this.logger.error('Scheduled task failed', { task: task.name }, error);
      }
    }
  }

  public nextInvocation(): Date | null {
    const next = this.job?.nextInvocation();
    if (!next) {
      return null;
    }
    return next instanceof Date ? next : next.toDate();
  }
}
