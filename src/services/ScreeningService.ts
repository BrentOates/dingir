import type { Client, GuildMember } from 'discord.js';
import type { App } from '../app.ts';
import { getConfig } from './ConfigService.ts';
import { onboard } from './OnboardingService.ts';
import {
  dropStaleOnboardingState,
  getOnboardingState,
  recordScreeningPending,
  type OnboardingState,
} from './UserProfileService.ts';

/** Tolerance for clock differences between Discord's joinedTimestamp and the bot's clock. */
const JOIN_SKEW_MS = 60_000;

/**
 * The member's recorded onboarding state, after dropping anything recorded before they last
 * joined (a previous membership whose leave or join was missed while the bot was offline).
 */
export async function currentOnboardingState(
  app: App,
  member: GuildMember,
): Promise<OnboardingState> {
  if (member.joinedTimestamp) {
    await dropStaleOnboardingState(
      app.db,
      member.guild.id,
      member.id,
      new Date(member.joinedTimestamp - JOIN_SKEW_MS),
    );
  }
  return getOnboardingState(app.db, member.guild.id, member.id);
}

/**
 * Startup reconciliation for events missed while offline: records members currently pending
 * screening (so a later update with an unknown previous state can be trusted), and onboards members
 * recorded as pending whose screening has since ended.
 */
export async function syncScreeningState(
  app: App,
  client: Client,
): Promise<{ recorded: number; caughtUp: number }> {
  let recorded = 0;
  let caughtUp = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      const members = await guild.members.fetch();
      for (const member of members.values()) {
        // A guildDelete during the sweep purges this guild's rows; never recreate them.
        if (member.user.bot || !client.guilds.cache.has(guild.id)) {
          continue;
        }
        const state = await currentOnboardingState(app, member);
        if (member.pending === true) {
          if (state.screeningPendingAt === null && state.onboardedAt === null) {
            await recordScreeningPending(app.db, guild.id, member.id, app.clock());
            recorded++;
          }
        } else if (state.screeningPendingAt !== null && state.onboardedAt === null) {
          const config = await getConfig(app, guild.id);
          if (await onboard(app, client, member, config)) {
            caughtUp++;
          }
        }
      }
    } catch (error) {
      app.logger.error('Could not sync screening state', { guild: guild.id }, error);
    }
  }
  app.logger.info('Synced screening state', { recorded, caughtUp });
  return { recorded, caughtUp };
}
