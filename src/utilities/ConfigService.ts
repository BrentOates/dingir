import { Message } from 'discord.js';
import { ServerConfig } from '../client/models/ServerConfig';

export class ConfigService {
  public static async getConfigByMessage(
    message: Message
  ): Promise<ServerConfig | undefined> {
    const [config] = await ServerConfig.findOrCreate({
      where: {
        serverId: message.guild.id,
      },
    });

    return config;
  }

  public static async getConfig(serverId: string): Promise<ServerConfig> {
    const [config] = await ServerConfig.findOrCreate({
      where: {
        serverId: serverId,
      },
    });

    return config;
  }

  public static async getConfigs(): Promise<ServerConfig[]> {
    return ServerConfig.findAll();
  }

  public static async deleteConfig(serverId: string): Promise<boolean> {
    const recordsDeleted = await ServerConfig.destroy({
      where: {
        serverId: serverId,
      },
    });

    return recordsDeleted > 0;
  }
}
