import { Guild } from 'discord.js';
import { NovaClient } from '../client/NovaClient';
import { RunFunction } from '../types/Event';
import { ConfigService } from '../utilities/ConfigService';
import { Logger } from '../utilities/Logger';
import { UserProfileService } from '../utilities/UserProfileService';

export const name = 'guildDelete';
export const run: RunFunction = async (client: NovaClient, guild: Guild) => {
  const configDeleted = await ConfigService.deleteConfig(guild.id);
  const userProfilesDeleted = await UserProfileService.deleteUsersByServer(
    guild.id
  );

  Logger.writeLog(`Bot removed from guild: ${guild.name} (${guild.id}).`);
  Logger.writeLog(`Config deleted: ${configDeleted}.`);
  Logger.writeLog(`User profiles deleted: ${userProfilesDeleted}.`);
};
