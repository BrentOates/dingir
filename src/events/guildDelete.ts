import { defineEvent } from '../framework/event';
import { ConfigService } from '../utilities/ConfigService';
import { Logger } from '../utilities/Logger';

export default defineEvent({
  name: 'guildDelete',
  run: async (client, guild) => {
    const result = await ConfigService.purgeGuild(guild.id);

    Logger.writeLog(`Bot removed from guild: ${guild.name} (${guild.id}).`);
    Logger.writeLog(`Config deleted: ${result.config}.`);
    Logger.writeLog(`User profiles deleted: ${result.profiles}.`);
  },
});
