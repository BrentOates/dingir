import type { Sequelize } from 'sequelize-typescript';
import { ServerConfig } from '../client/models/ServerConfig';
import { UserProfile } from '../client/models/UserProfile';

export class ConfigService {
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

  public static async purgeGuild(
    serverId: string,
    sequelize?: Sequelize
  ): Promise<{ config: boolean; profiles: number }> {
    const db = sequelize ?? ServerConfig.sequelize;
    if (!db) {
      throw new Error('ServerConfig is not bound to a Sequelize instance');
    }

    return db.transaction(async (transaction) => {
      const profiles = await UserProfile.destroy({ where: { serverId }, transaction });
      const configs = await ServerConfig.destroy({ where: { serverId }, transaction });
      return { config: configs > 0, profiles };
    });
  }
}
