import { defineEvent } from '../framework/event.ts';
import { purgeGuild } from '../services/ConfigService.ts';

export default defineEvent({
  name: 'guildDelete',
  run: async (app, _client, guild) => {
    const result = await purgeGuild(app, guild.id);
    app.logger.info('Bot removed from guild', {
      guild: guild.id,
      name: guild.name,
      config: result.config,
      profiles: result.profiles,
    });
  },
});
