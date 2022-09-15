import { Guild } from 'discord.js';
import { NovaClient } from '../client/NovaClient';
import { RunFunction } from '../types/Event';
import { ConfigService } from '../utilities/ConfigService';
import { Logger } from '../utilities/Logger';

export const name = 'guildCreate';
export const run: RunFunction = async (client: NovaClient, guild: Guild) => {
  ConfigService.getConfig(guild.id)
    .then((config) => {
      if (config) {
        return Logger.writeLog(
          `Bot added to new guild: ${guild.name} (${guild.id}).`
        );
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
};
