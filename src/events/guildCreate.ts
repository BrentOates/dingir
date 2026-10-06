import { defineEvent } from '../framework/event.ts';
import { getConfig, resetAccessFailures } from '../services/ConfigService.ts';
import { syncGuildScreening } from '../services/ScreeningService.ts';

export default defineEvent({
  name: 'guildCreate',
  run: async (app, client, guild) => {
    const config = await getConfig(app, guild.id);
    await resetAccessFailures(app, config);
    app.logger.info('Bot added to guild', { guild: guild.id, name: guild.name });
    // Members already pending screening when the bot arrives have no recorded state yet.
    await syncGuildScreening(app, client, guild);
  },
});
