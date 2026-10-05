import { eq } from 'drizzle-orm';
import type { Db } from '../../src/db/db.ts';
import {
  serverConfigs,
  userProfiles,
  type ServerConfig,
  type UserProfile,
} from '../../src/db/schema.ts';

type ConfigInsert = typeof serverConfigs.$inferInsert;
type ProfileInsert = typeof userProfiles.$inferInsert;

/** Direct table access for arranging and asserting database state in tests. */
export function dbFixtures(db: Db) {
  const allProfiles = (): UserProfile[] => db.select().from(userProfiles).all();
  return {
    clearConfigs: (): void => {
      db.delete(serverConfigs).run();
    },
    clearProfiles: (): void => {
      db.delete(userProfiles).run();
    },
    createConfig: (values: ConfigInsert): ServerConfig =>
      db.insert(serverConfigs).values(values).returning().get(),
    createConfigs: (values: ConfigInsert[]): void => {
      db.insert(serverConfigs).values(values).run();
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
