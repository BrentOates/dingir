import type { Snowflake } from 'discord.js';

const ENFORCEMENT_WINDOW_MS = 5 * 60 * 1000;

export interface HoneypotTracker {
  /** Marks enforcement as started; false when it is already in progress for this member. */
  begin(serverId: Snowflake, userId: Snowflake): boolean;
  isActive(serverId: Snowflake, userId: Snowflake): boolean;
  cancel(serverId: Snowflake, userId: Snowflake): void;
}

export function createHoneypotTracker(): HoneypotTracker {
  const active = new Map<string, NodeJS.Timeout>();
  const keyOf = (serverId: Snowflake, userId: Snowflake): string => `${serverId}:${userId}`;

  return {
    begin: (serverId, userId) => {
      const key = keyOf(serverId, userId);
      if (active.has(key)) {
        return false;
      }
      const timeout = setTimeout(() => {
        active.delete(key);
      }, ENFORCEMENT_WINDOW_MS);
      timeout.unref();
      active.set(key, timeout);
      return true;
    },
    isActive: (serverId, userId) => active.has(keyOf(serverId, userId)),
    cancel: (serverId, userId) => {
      const key = keyOf(serverId, userId);
      const timeout = active.get(key);
      if (timeout) {
        clearTimeout(timeout);
        active.delete(key);
      }
    },
  };
}
