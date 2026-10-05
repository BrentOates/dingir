import { eq } from 'drizzle-orm';
import type { Db } from '../db/db.ts';
import { botState } from '../db/schema.ts';

export function getState(db: Db, key: string): string | undefined {
  return db.select().from(botState).where(eq(botState.key, key)).get()?.value;
}

export function setState(db: Db, key: string, value: string, now: Date = new Date()): void {
  db.insert(botState)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: botState.key, set: { value, updatedAt: now } })
    .run();
}
