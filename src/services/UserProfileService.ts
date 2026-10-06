import type { Snowflake } from 'discord.js';
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
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

/**
 * Deletes profiles by row id. A row id is never reused, so a profile created after the ids were
 * read (a member who left and rejoined) is not deleted along with the stale row.
 */
export async function deleteProfiles(db: Db, serverId: Snowflake, ids: number[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < ids.length; i += 500) {
    removed += db
      .delete(userProfiles)
      .where(
        and(eq(userProfiles.serverId, serverId), inArray(userProfiles.id, ids.slice(i, i + 500))),
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

/** Deletes a member's profile and returns what was stored, or null when there was none. */
export async function deleteUser(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
): Promise<UserProfile | null> {
  return db.delete(userProfiles).where(forUser(serverId, userId)).returning().get() ?? null;
}

/**
 * Begins a new membership: forgets every state recorded for a previous one. Pass `pending` when
 * the member is awaiting screening.
 */
export async function startMembership(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
  at: Date,
  pending: boolean,
): Promise<void> {
  const screeningPendingAt = pending ? at : null;
  db.insert(userProfiles)
    .values({ serverId, userId, screeningPendingAt })
    .onConflictDoUpdate({
      target: [userProfiles.serverId, userProfiles.userId],
      set: { screeningPendingAt, onboardedAt: null, updatedAt: at },
    })
    .run();
}

/**
 * Atomically claims the single onboarding of the current membership. Returns false when it was
 * already claimed, so concurrent or replayed events cannot onboard a member twice.
 */
export async function claimOnboarding(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
  at: Date,
): Promise<boolean> {
  return (
    db
      .insert(userProfiles)
      .values({ serverId, userId, onboardedAt: at })
      .onConflictDoUpdate({
        target: [userProfiles.serverId, userProfiles.userId],
        set: { onboardedAt: at, screeningPendingAt: null, updatedAt: at },
        setWhere: isNull(userProfiles.onboardedAt),
      })
      .run().changes > 0
  );
}

/** Records that a member is awaiting screening, unless anything is already known about them. */
export async function recordScreeningPending(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
  at: Date,
): Promise<void> {
  db.insert(userProfiles)
    .values({ serverId, userId, screeningPendingAt: at })
    .onConflictDoUpdate({
      target: [userProfiles.serverId, userProfiles.userId],
      set: { screeningPendingAt: at, updatedAt: at },
      setWhere: and(isNull(userProfiles.screeningPendingAt), isNull(userProfiles.onboardedAt)),
    })
    .run();
}

/** Drops recorded timestamps older than `cutoff`: they belong to a membership that has ended. */
export async function dropStaleOnboardingState(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
  cutoff: Date,
): Promise<void> {
  const mine = forUser(serverId, userId);
  db.update(userProfiles)
    .set({ onboardedAt: null })
    .where(and(mine, lt(userProfiles.onboardedAt, cutoff)))
    .run();
  db.update(userProfiles)
    .set({ screeningPendingAt: null })
    .where(and(mine, lt(userProfiles.screeningPendingAt, cutoff)))
    .run();
}

export interface OnboardingState {
  screeningPendingAt: Date | null;
  onboardedAt: Date | null;
}

export async function getOnboardingState(
  db: Db,
  serverId: Snowflake,
  userId: Snowflake,
): Promise<OnboardingState> {
  const profile = await findUserProfile(db, serverId, userId);
  return {
    screeningPendingAt: profile?.screeningPendingAt ?? null,
    onboardedAt: profile?.onboardedAt ?? null,
  };
}
