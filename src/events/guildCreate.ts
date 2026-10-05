import { defineEvent } from '../framework/event.ts';
import { getConfig, resetAccessFailures } from '../services/ConfigService.ts';

export default defineEvent({
  name: 'guildCreate',
  run: async (app, _client, guild) => {
    const config = await getConfig(app, guild.id);
    await resetAccessFailures(app, config);
    app.logger.info('Bot added to guild', { guild: guild.id, name: guild.name });
  },
});
