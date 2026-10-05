import { defineEvent } from '../framework/event';
import { ConfigService } from '../utilities/ConfigService';
import { Logger } from '../utilities/Logger';

export default defineEvent({
  name: 'guildCreate',
  run: async (client, guild) => {
    const config = await ConfigService.getConfig(guild.id);
    await ConfigService.resetAccessFailures(config);
    Logger.info('Bot added to guild', { guild: guild.id, name: guild.name });
  },
});
