import type { Snowflake } from 'discord.js';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/db.ts';
import { serverConfigs, userProfiles, type ServerConfig } from '../db/schema.ts';

export type ServerConfigPatch = Partial<Omit<ServerConfig, 'serverId' | 'createdAt' | 'updatedAt'>>;

export async function getConfig(db: Db, serverId: Snowflake): Promise<ServerConfig> {
  db.insert(serverConfigs).values({ serverId }).onConflictDoNothing().run();
  return db.select().from(serverConfigs).where(eq(serverConfigs.serverId, serverId)).get()!;
}

export async function getConfigs(db: Db): Promise<ServerConfig[]> {
  return db.select().from(serverConfigs).all();
}

export async function updateConfig(
  db: Db,
  serverId: Snowflake,
  patch: ServerConfigPatch
): Promise<ServerConfig> {
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

export async function deleteConfig(db: Db, serverId: Snowflake): Promise<boolean> {
  const result = db.delete(serverConfigs).where(eq(serverConfigs.serverId, serverId)).run();
  return result.changes > 0;
}

export async function resetAccessFailures(db: Db, config: ServerConfig): Promise<ServerConfig> {
  if (config.accessFailureCount === 0 && config.firstAccessFailureAt === null) {
    return config;
  }
  return updateConfig(db, config.serverId, { accessFailureCount: 0, firstAccessFailureAt: null });
}

export async function purgeGuild(
  db: Db,
  serverId: Snowflake
): Promise<{ config: boolean; profiles: number }> {
  return db.transaction((tx) => {
    const profiles = tx.delete(userProfiles).where(eq(userProfiles.serverId, serverId)).run();
    const configs = tx.delete(serverConfigs).where(eq(serverConfigs.serverId, serverId)).run();
    return { config: configs.changes > 0, profiles: profiles.changes };
  });
}
