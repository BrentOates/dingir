import { env } from '../config/env';
import { defineEvent } from '../framework/event';
import { registerShutdownHook } from '../framework/shutdown';
import { notifyBirthdays, refreshAllCalendars } from '../services/BirthdayService';
import { run as runDataCheck } from '../services/DataCheckService';
import { Scheduler } from '../services/Scheduler';
import { CommandRegistrar } from '../framework/CommandRegistrar';
import { Logger } from '../utilities/Logger';

let schedulerInstalled = false;

export default defineEvent({
  name: 'clientReady',
  once: true,
  run: async (client) => {
    client.user!.setPresence({ status: 'online' });

    Logger.info('Online');
    await CommandRegistrar.register([...client.slashCommands.values()]);

    if (schedulerInstalled) {
      return;
    }
    schedulerInstalled = true;

    try {
      const scheduler = new Scheduler(env.jobSchedule, env.timezone, [
        { name: 'data-check', run: () => runDataCheck(client) },
        { name: 'birthday-notifications', run: () => notifyBirthdays(client) },
        { name: 'birthday-calendars', run: () => refreshAllCalendars(client) },
      ]);
      scheduler.start();
      registerShutdownHook(() => scheduler.stop());
      Logger.info('Scheduler started', {
        schedule: env.jobSchedule,
        timezone: env.timezone,
        next: scheduler.nextInvocation()?.toISOString(),
      });
    } catch (error) {
      Logger.error('Could not start scheduler; scheduled jobs are disabled', undefined, error);
    }
  },
});
