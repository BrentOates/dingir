import { defineEvent } from '../framework/event';
import { ConfigService } from '../utilities/ConfigService';
import { Logger } from '../utilities/Logger';

export default defineEvent({
  name: 'guildCreate',
  run: async (client, guild) => {
    ConfigService.getConfig(guild.id)
      .then((config) => {
        if (config) {
          return Logger.writeLog(`Bot added to new guild: ${guild.name} (${guild.id}).`);
        }
        return Logger.writeError(
          `Bot added to new guild, but config could not be generated: ${guild.name} (${guild.id}).`
        );
      })
      .catch((err) => {
        return Logger.writeError(
          `Bot added to new guild, but config could not be generated: ${guild.name} (${guild.id}).`,
          err
        );
      });
  },
});
