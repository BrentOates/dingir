import { scheduleJob } from 'node-schedule';
import { Logger } from '../utilities/Logger';

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

const defaultScheduleFn: ScheduleFn = (spec, callback) => scheduleJob(spec, callback);

export class Scheduler {
  private job: ScheduledJobLike | null = null;
  private running = false;

  public constructor(
    private readonly cron: string,
    private readonly timezone: string,
    private readonly tasks: SchedulerTask[],
    private readonly scheduleFn: ScheduleFn = defaultScheduleFn
  ) {}

  public start(): void {
    if (this.job) {
      Logger.warn('Scheduler already started', { cron: this.cron });
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

  public stop(): void {
    this.job?.cancel();
    this.job = null;
  }

  public async runNow(): Promise<void> {
    if (this.running) {
      Logger.warn('Scheduled run skipped; previous run still in progress');
      return;
    }
    this.running = true;
    try {
      for (const task of this.tasks) {
        try {
          await task.run();
        } catch (error) {
          Logger.error('Scheduled task failed', { task: task.name }, error);
        }
      }
    } finally {
      this.running = false;
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
