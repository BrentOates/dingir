import { env } from '../config/env';
import schedule from 'node-schedule';
import { NovaClient } from '../client/NovaClient';
import { RunFunction } from '../types/Event';
import { BirthdayManager } from '../utilities/BirthdayManager';
import { CommandRegistrar } from '../utilities/CommandRegistrar';
import { DataCheck } from '../utilities/DataCheck';
import { Logger } from '../utilities/Logger';

export const name = 'ready';
export const run: RunFunction = async (client: NovaClient) => {
  client.user!.setPresence({ status: 'online' });

  Logger.writeLog('Online');
  await CommandRegistrar.registerGlobalCommands(client);

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
};
