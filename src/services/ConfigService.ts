import type { Snowflake } from 'discord.js';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/db.ts';
import { serverConfigs, userProfiles, type ServerConfig } from '../db/schema.ts';

/** Per-app cache of server configs, kept coherent by the functions below. */
export type ConfigCache = Map<Snowflake, ServerConfig>;

export interface ConfigDeps {
  db: Db;
  configCache: ConfigCache;
}

export const createConfigCache = (): ConfigCache => new Map();

export type ServerConfigPatch = Partial<Omit<ServerConfig, 'serverId' | 'createdAt' | 'updatedAt'>>;

export async function getConfig(
  { db, configCache }: ConfigDeps,
  serverId: Snowflake,
): Promise<ServerConfig> {
  const cached = configCache.get(serverId);
  if (cached) {
    return cached;
  }
  db.insert(serverConfigs).values({ serverId }).onConflictDoNothing().run();
  const config = db.select().from(serverConfigs).where(eq(serverConfigs.serverId, serverId)).get();
  if (!config) {
    throw new Error(`Server config for ${serverId} is missing after insert`);
  }
  configCache.set(serverId, config);
  return config;
}

/** Reads a config without creating it: null when the guild has no (or no longer has a) row. */
export async function findConfig(
  { db, configCache }: ConfigDeps,
  serverId: Snowflake,
): Promise<ServerConfig | null> {
  return (
    configCache.get(serverId) ??
    db.select().from(serverConfigs).where(eq(serverConfigs.serverId, serverId)).get() ??
    null
  );
}

export async function getConfigs(db: Db): Promise<ServerConfig[]> {
  return db.select().from(serverConfigs).all();
}

export async function updateConfig(
  deps: ConfigDeps,
  serverId: Snowflake,
  patch: ServerConfigPatch,
): Promise<ServerConfig> {
  return (await swapConfig(deps, serverId, patch)).updated;
}

/** Like updateConfig, but also returns the config as it was in the same atomic step. */
export async function swapConfig(
  { db, configCache }: ConfigDeps,
  serverId: Snowflake,
  patch: ServerConfigPatch,
): Promise<{ previous: ServerConfig; updated: ServerConfig }> {
  configCache.delete(serverId);
  const result = db.transaction((tx) => {
    tx.insert(serverConfigs).values({ serverId }).onConflictDoNothing().run();
    const previous = tx
      .select()
      .from(serverConfigs)
      .where(eq(serverConfigs.serverId, serverId))
      .get()!;
    const updated = tx
      .update(serverConfigs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(serverConfigs.serverId, serverId))
      .returning()
      .get();
    return { previous, updated };
  });
  configCache.set(serverId, result.updated);
  return result;
}

/**
 * Patch a config only if its row still exists (no upsert). For background jobs, which must not
 * resurrect a config that was purged while they were running.
 */
export async function updateExistingConfig(
  { db, configCache }: ConfigDeps,
  serverId: Snowflake,
  patch: ServerConfigPatch,
): Promise<ServerConfig | null> {
  configCache.delete(serverId);
  const updated = db
    .update(serverConfigs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(serverConfigs.serverId, serverId))
    .returning()
    .get();
  if (!updated) {
    return null;
  }
  configCache.set(serverId, updated);
  return updated;
}

export async function deleteConfig(
  { db, configCache }: ConfigDeps,
  serverId: Snowflake,
): Promise<boolean> {
  configCache.delete(serverId);
  const result = db.delete(serverConfigs).where(eq(serverConfigs.serverId, serverId)).run();
  return result.changes > 0;
}

export async function resetAccessFailures(
  deps: ConfigDeps,
  config: ServerConfig,
): Promise<ServerConfig> {
  if (config.accessFailureCount === 0 && config.firstAccessFailureAt === null) {
    return config;
  }
  return updateConfig(deps, config.serverId, { accessFailureCount: 0, firstAccessFailureAt: null });
}

export async function purgeGuild(
  { db, configCache }: ConfigDeps,
  serverId: Snowflake,
): Promise<{ config: boolean; profiles: number }> {
  configCache.delete(serverId);
  return db.transaction((tx) => {
    const profiles = tx.delete(userProfiles).where(eq(userProfiles.serverId, serverId)).run();
    const configs = tx.delete(serverConfigs).where(eq(serverConfigs.serverId, serverId)).run();
    return { config: configs.changes > 0, profiles: profiles.changes };
  });
}
