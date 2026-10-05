import { eq } from 'drizzle-orm';
import type { ConfigDeps } from '../../src/services/ConfigService.ts';
import {
  serverConfigs,
  userProfiles,
  type ServerConfig,
  type UserProfile,
} from '../../src/db/schema.ts';

type ConfigInsert = typeof serverConfigs.$inferInsert;
type ProfileInsert = typeof userProfiles.$inferInsert;

/**
 * Direct table access for arranging and asserting database state in tests.
 * Config mutations bypass ConfigService, so they also reset the config cache.
 */
export function dbFixtures({ db, configCache }: ConfigDeps) {
  const allProfiles = (): UserProfile[] => db.select().from(userProfiles).all();
  return {
    clearConfigs: (): void => {
      db.delete(serverConfigs).run();
      configCache.clear();
    },
    clearProfiles: (): void => {
      db.delete(userProfiles).run();
    },
    createConfig: (values: ConfigInsert): ServerConfig => {
      configCache.delete(values.serverId);
      return db.insert(serverConfigs).values(values).returning().get();
    },
    createConfigs: (values: ConfigInsert[]): void => {
      db.insert(serverConfigs).values(values).run();
      configCache.clear();
    },
    findConfig: (serverId: string): ServerConfig | null =>
      db.select().from(serverConfigs).where(eq(serverConfigs.serverId, serverId)).get() ?? null,
    createProfiles: (values: ProfileInsert[]): void => {
      db.insert(userProfiles).values(values).run();
    },
    allProfiles,
    countProfiles: (): number => allProfiles().length,
    findProfile: (userId: string, serverId?: string): UserProfile | null =>
      allProfiles().find(
        (p) => p.userId === userId && (serverId === undefined || p.serverId === serverId)
      ) ?? null,
  };
}

export type DbFixtures = ReturnType<typeof dbFixtures>;
