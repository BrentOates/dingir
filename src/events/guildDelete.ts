import { defineEvent } from '../framework/event';
import { ConfigService } from '../utilities/ConfigService';
import { Logger } from '../utilities/Logger';

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
