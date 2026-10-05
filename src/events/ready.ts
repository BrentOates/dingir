import { defineEvent } from '../framework/event.ts';
import { syncCommands } from '../framework/registrar.ts';
import { notifyBirthdays, refreshAllCalendars } from '../services/BirthdayService.ts';
import { runDataCheck } from '../services/DataCheckService.ts';
import { Scheduler } from '../services/Scheduler.ts';

export default defineEvent({
  name: 'clientReady',
  once: true,
  run: async (app, client) => {
    const { env, logger } = app;
    client.user!.setPresence({ status: 'online' });

    logger.info('Online');
    await syncCommands(app, [...client.slashCommands.values()]);

    try {
      const scheduler = new Scheduler(logger, env.jobSchedule, env.timezone, [
        { name: 'data-check', run: () => runDataCheck(app, client) },
        { name: 'birthday-notifications', run: () => notifyBirthdays(app, client) },
        { name: 'birthday-calendars', run: () => refreshAllCalendars(app, client) },
      ]);
      scheduler.start();
      app.shutdown.register(() => scheduler.stop());
      logger.info('Scheduler started', {
        schedule: env.jobSchedule,
        timezone: env.timezone,
        next: scheduler.nextInvocation()?.toISOString(),
      });
    } catch (error) {
      logger.error('Could not start scheduler; scheduled jobs are disabled', undefined, error);
    }
  },
});
