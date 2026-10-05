import { eq } from 'drizzle-orm';
import { createDatabase, getDb, setDatabase, type DatabaseHandle } from '../../src/db/db.ts';
import { migrate } from '../../src/db/migrator.ts';
import {
  serverConfigs,
  userProfiles,
  type ServerConfig,
  type UserProfile,
} from '../../src/db/schema.ts';

/** An in-memory, fully migrated database that the services use until it is closed. */
export function createTestDb(): DatabaseHandle {
  const handle = createDatabase(':memory:');
  migrate(handle.sqlite);
  setDatabase(handle);
  return handle;
}

export function closeTestDb(handle: DatabaseHandle): void {
  setDatabase(undefined);
  handle.sqlite.close();
}

type ConfigInsert = typeof serverConfigs.$inferInsert;
type ProfileInsert = typeof userProfiles.$inferInsert;

export const clearConfigs = (): void => {
  getDb().delete(serverConfigs).run();
};

export const clearProfiles = (): void => {
  getDb().delete(userProfiles).run();
};

export const createConfig = (values: ConfigInsert): ServerConfig =>
  getDb().insert(serverConfigs).values(values).returning().get();

export const createConfigs = (values: ConfigInsert[]): void => {
  getDb().insert(serverConfigs).values(values).run();
};

export const findConfig = (serverId: string): ServerConfig | null =>
  getDb().select().from(serverConfigs).where(eq(serverConfigs.serverId, serverId)).get() ?? null;

export const createProfiles = (values: ProfileInsert[]): void => {
  getDb().insert(userProfiles).values(values).run();
};

export const allProfiles = (): UserProfile[] => getDb().select().from(userProfiles).all();

export const countProfiles = (): number => allProfiles().length;

export const findProfile = (userId: string, serverId?: string): UserProfile | null =>
  allProfiles().find((p) => p.userId === userId && (serverId === undefined || p.serverId === serverId)) ??
  null;
