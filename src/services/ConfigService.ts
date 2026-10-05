import { eq } from 'drizzle-orm';
import { getDb, type AppDatabase } from '../client/database/db';
import { serverConfigs, userProfiles, type ServerConfig } from '../client/database/schema';

export type ServerConfigPatch = Partial<Omit<ServerConfig, 'serverId' | 'createdAt' | 'updatedAt'>>;

export class ConfigService {
  public static async getConfig(serverId: string): Promise<ServerConfig> {
    const db = getDb();
    db.insert(serverConfigs).values({ serverId }).onConflictDoNothing().run();
    return db.select().from(serverConfigs).where(eq(serverConfigs.serverId, serverId)).get()!;
  }

  public static async getConfigs(): Promise<ServerConfig[]> {
    return getDb().select().from(serverConfigs).all();
  }

  public static async updateConfig(
    serverId: string,
    patch: ServerConfigPatch
  ): Promise<ServerConfig> {
    const db = getDb();
    return db.transaction((tx) => {
      tx.insert(serverConfigs).values({ serverId }).onConflictDoNothing().run();
      return tx
        .update(serverConfigs)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(serverConfigs.serverId, serverId))
        .returning()
        .get();
    });
  }

  public static async deleteConfig(serverId: string): Promise<boolean> {
    const result = getDb().delete(serverConfigs).where(eq(serverConfigs.serverId, serverId)).run();
    return result.changes > 0;
  }

  public static async resetAccessFailures(config: ServerConfig): Promise<ServerConfig> {
    if (config.accessFailureCount === 0 && config.firstAccessFailureAt === null) {
      return config;
    }
    return this.updateConfig(config.serverId, { accessFailureCount: 0, firstAccessFailureAt: null });
  }

  public static async purgeGuild(
    serverId: string,
    database: AppDatabase = getDb()
  ): Promise<{ config: boolean; profiles: number }> {
    return database.transaction((tx) => {
      const profiles = tx.delete(userProfiles).where(eq(userProfiles.serverId, serverId)).run();
      const configs = tx.delete(serverConfigs).where(eq(serverConfigs.serverId, serverId)).run();
      return { config: configs.changes > 0, profiles: profiles.changes };
    });
  }
}
