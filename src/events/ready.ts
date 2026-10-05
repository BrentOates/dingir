import { env } from '../config/env';
import schedule from 'node-schedule';
import { defineEvent } from '../framework/event';
import { BirthdayManager } from '../utilities/BirthdayManager';
import { CommandRegistrar } from '../utilities/CommandRegistrar';
import { DataCheck } from '../utilities/DataCheck';
import { Logger } from '../utilities/Logger';

export default defineEvent({
  name: 'clientReady',
  once: true,
  run: async (client) => {
    client.user!.setPresence({ status: 'online' });

    Logger.writeLog('Online');
    await CommandRegistrar.register([...client.slashCommands.values()]);

    const logFailure = (job: string) => (err: unknown) =>
      Logger.writeError(`Scheduled job failed: ${job}.`, err);

    const birthdaySchedule = schedule.scheduleJob(env.jobSchedule, () => {
      DataCheck.dataCleanup(client).catch(logFailure('data cleanup'));
      BirthdayManager.notifyBirthdays(client).catch(logFailure('birthday notifications'));
      BirthdayManager.populateCalendars(client).catch(logFailure('birthday calendars'));
    });
    if (!birthdaySchedule) {
      Logger.writeError(`Could not schedule job with "${env.jobSchedule}".`);
      return;
    }
    Logger.writeLog(`Primary schedule set, next run at ${birthdaySchedule.nextInvocation()}`);
  },
});
