import { defineEvent } from '../framework/event.ts';
import { ConfigService } from '../services/ConfigService.ts';
import { Logger } from '../utilities/Logger.ts';

export default defineEvent({
  name: 'guildDelete',
  run: async (client, guild) => {
    const result = await ConfigService.purgeGuild(guild.id);
    Logger.info('Bot removed from guild', {
      guild: guild.id,
      name: guild.name,
      config: result.config,
      profiles: result.profiles,
    });
  },
});
