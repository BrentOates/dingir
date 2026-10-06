import type { Client } from 'discord.js';
import type { App } from '../app.ts';
import { getOnboardingState, markScreeningPending } from './UserProfileService.ts';

/**
 * Records every member currently pending membership screening, so a later update with an unknown
 * previous state can still be trusted. Run at startup for members who joined before this was tracked.
 */
export async function recordPendingMembers(app: App, client: Client): Promise<number> {
  let recorded = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      const members = await guild.members.fetch();
      for (const member of members.values()) {
        if (member.user.bot || member.pending !== true) {
          continue;
        }
        const state = await getOnboardingState(app.db, guild.id, member.id);
        if (state.screeningPendingAt === null && state.onboardedAt === null) {
          await markScreeningPending(app.db, guild.id, member.id, app.clock());
          recorded++;
        }
      }
    } catch (error) {
      app.logger.error('Could not record pending members', { guild: guild.id }, error);
    }
  }
  app.logger.info('Recorded pending members', { count: recorded });
  return recorded;
}
