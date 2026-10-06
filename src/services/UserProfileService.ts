import type { Snowflake } from 'discord.js';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { Db } from '../db/db.ts';
import { userProfiles, type UserProfile } from '../db/schema.ts';

const forUser = (serverId: Snowflake, userId: Snowflake) =>
  and(eq(userProfiles.serverId, serverId), eq(userProfiles.userId, userId));

export async function getServerBirthdays(db: Db, serverId: Snowflake): Promise<UserProfile[]> {
  return db
    .select()
    .from(userProfiles)
    .where(
      and(
        eq(userProfiles.serverId, serverId),
        isNotNull(userProfiles.birthdayDay),
        isNotNull(userProfiles.birthdayMonth),
      ),
    )
    .all();
}

export async function getServerProfiles(db: Db, serverId: Snowflake): Promise<UserProfile[]> {
  return db.select().from(userProfiles).where(eq(userProfiles.serverId, serverId)).all();
}

export async function setBirthday(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
  month: number,
  day: number,
): Promise<void> {
  db.insert(userProfiles)
    .values({ serverId, userId, birthdayMonth: month, birthdayDay: day })
    .onConflictDoUpdate({
      target: [userProfiles.serverId, userProfiles.userId],
      set: { birthdayMonth: month, birthdayDay: day, updatedAt: new Date() },
    })
    .run();
}

export async function clearBirthday(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
): Promise<boolean> {
  const result = db
    .update(userProfiles)
    .set({ birthdayYear: null, birthdayMonth: null, birthdayDay: null, updatedAt: new Date() })
    .where(
      and(
        forUser(serverId, userId),
        or(
          isNotNull(userProfiles.birthdayMonth),
          isNotNull(userProfiles.birthdayDay),
          isNotNull(userProfiles.birthdayYear),
        ),
      ),
    )
    .run();
  return result.changes > 0;
}

export async function deleteUsers(
  db: Db,
  serverId: Snowflake,
  userIds: Snowflake[],
): Promise<number> {
  let removed = 0;
  for (let i = 0; i < userIds.length; i += 500) {
    removed += db
      .delete(userProfiles)
      .where(
        and(
          eq(userProfiles.serverId, serverId),
          inArray(userProfiles.userId, userIds.slice(i, i + 500)),
        ),
      )
      .run().changes;
  }
  return removed;
}

export async function getUserProfile(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
): Promise<UserProfile> {
  db.insert(userProfiles).values({ serverId, userId }).onConflictDoNothing().run();
  return db.select().from(userProfiles).where(forUser(serverId, userId)).get()!;
}

export async function findUserProfile(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
): Promise<UserProfile | null> {
  return db.select().from(userProfiles).where(forUser(serverId, userId)).get() ?? null;
}

export async function incrementActivityScore(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
): Promise<void> {
  db.insert(userProfiles)
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

export async function deleteUser(db: Db, serverId: Snowflake, userId: Snowflake): Promise<boolean> {
  const result = db.delete(userProfiles).where(forUser(serverId, userId)).run();
  return result.changes > 0;
}

export async function deleteUsersByServer(db: Db, serverId: Snowflake): Promise<boolean> {
  const result = db.delete(userProfiles).where(eq(userProfiles.serverId, serverId)).run();
  return result.changes > 0;
}

export async function markOnboarded(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
  at: Date,
): Promise<void> {
  db.insert(userProfiles)
    .values({ serverId, userId, onboardedAt: at })
    .onConflictDoUpdate({
      target: [userProfiles.serverId, userProfiles.userId],
      set: { onboardedAt: at, updatedAt: at },
    })
    .run();
}

export async function getOnboardedAt(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
): Promise<Date | null> {
  return (await findUserProfile(db, serverId, userId))?.onboardedAt ?? null;
}
