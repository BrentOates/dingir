import schedule from 'node-schedule';
import { NovaClient } from '../client/NovaClient';
import { RunFunction } from '../types/Event';
import { BirthdayManager } from '../utilities/BirthdayManager';
import { DataCheck } from '../utilities/DataCheck';
import { Logger } from '../utilities/Logger';

export const name = 'ready';
export const run: RunFunction = async (client: NovaClient) => {
  client.user.setPresence({
    status: 'online',
  });

  Logger.writeLog('Online');
  const birthdaySchedule = schedule.scheduleJob(
    process.env.JOB_SCHEDULE,
    () => {
      DataCheck.dataCleanup(client);
      BirthdayManager.notifyBirthdays(client);
      BirthdayManager.populateCalendars(client);
    }
  );
  Logger.writeLog(
    `Primary schedule set, next run at ${birthdaySchedule.nextInvocation()}`
  );
};
