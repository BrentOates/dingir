import { defineEvent } from '../framework/event';
import { ConfigService } from '../utilities/ConfigService';
import { Logger } from '../utilities/Logger';
import { UserProfileService } from '../utilities/UserProfileService';

export default defineEvent({
  name: 'guildDelete',
  run: async (client, guild) => {
    const configDeleted = await ConfigService.deleteConfig(guild.id);
    const userProfilesDeleted = await UserProfileService.deleteUsersByServer(guild.id);

    Logger.writeLog(`Bot removed from guild: ${guild.name} (${guild.id}).`);
    Logger.writeLog(`Config deleted: ${configDeleted}.`);
    Logger.writeLog(`User profiles deleted: ${userProfilesDeleted}.`);
  },
});
