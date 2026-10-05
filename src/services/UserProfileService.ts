import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '../client/database/db.ts';
import { userProfiles, type UserProfile } from '../client/database/schema.ts';

export class UserProfileService {
  public static async getServerBirthdays(serverId: string): Promise<UserProfile[]> {
    return getDb()
      .select()
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.serverId, serverId),
          isNotNull(userProfiles.birthdayDay),
          isNotNull(userProfiles.birthdayMonth)
        )
      )
      .all();
  }

  public static async getServerProfiles(serverId: string): Promise<UserProfile[]> {
    return getDb().select().from(userProfiles).where(eq(userProfiles.serverId, serverId)).all();
  }

  public static async setBirthday(
    serverId: string,
    userId: string,
    month: number,
    day: number
  ): Promise<void> {
    getDb()
      .insert(userProfiles)
      .values({ serverId, userId, birthdayMonth: month, birthdayDay: day })
      .onConflictDoUpdate({
        target: [userProfiles.serverId, userProfiles.userId],
        set: { birthdayMonth: month, birthdayDay: day, updatedAt: new Date() },
      })
      .run();
  }

  public static async clearBirthday(serverId: string, userId: string): Promise<boolean> {
    const result = getDb()
      .update(userProfiles)
      .set({ birthdayYear: null, birthdayMonth: null, birthdayDay: null, updatedAt: new Date() })
      .where(and(eq(userProfiles.serverId, serverId), eq(userProfiles.userId, userId)))
      .run();
    return result.changes > 0;
  }

  public static async deleteUsers(serverId: string, userIds: string[]): Promise<number> {
    const db = getDb();
    let removed = 0;
    for (let i = 0; i < userIds.length; i += 500) {
      removed += db
        .delete(userProfiles)
        .where(
          and(eq(userProfiles.serverId, serverId), inArray(userProfiles.userId, userIds.slice(i, i + 500)))
        )
        .run().changes;
    }
    return removed;
  }

  public static async getUserProfile(serverId: string, userId: string): Promise<UserProfile> {
    const db = getDb();
    db.insert(userProfiles).values({ serverId, userId }).onConflictDoNothing().run();
    return db
      .select()
      .from(userProfiles)
      .where(and(eq(userProfiles.serverId, serverId), eq(userProfiles.userId, userId)))
      .get()!;
  }

  public static async findUserProfile(
    serverId: string,
    userId: string
  ): Promise<UserProfile | null> {
    return (
      getDb()
        .select()
        .from(userProfiles)
        .where(and(eq(userProfiles.serverId, serverId), eq(userProfiles.userId, userId)))
        .get() ?? null
    );
  }

  public static async incrementActivityScore(serverId: string, userId: string): Promise<void> {
    getDb()
      .insert(userProfiles)
      .values({ serverId, userId, activityScore: 1 })
      .onConflictDoUpdate({
        target: [userProfiles.serverId, userProfiles.userId],
        set: {
          activityScore: sql`coalesce(${userProfiles.activityScore}, 0) + 1`,
          updatedAt: new Date(),
        },
      })
      .run();
  }

  public static async deleteUser(serverId: string, userId: string): Promise<boolean> {
    const result = getDb()
      .delete(userProfiles)
      .where(and(eq(userProfiles.serverId, serverId), eq(userProfiles.userId, userId)))
      .run();
    return result.changes > 0;
  }

  public static async deleteUsersByServer(serverId: string): Promise<boolean> {
    const result = getDb().delete(userProfiles).where(eq(userProfiles.serverId, serverId)).run();
    return result.changes > 0;
  }
}
