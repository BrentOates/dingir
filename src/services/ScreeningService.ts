import type { Client, Guild, GuildMember } from 'discord.js';
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

export interface SyncResult {
  recorded: number;
  caughtUp: number;
}

/**
 * Reconciles one guild's members with the recorded screening state, for events missed while the
 * bot was offline or not yet in the guild: records members currently pending screening (so a later
 * update with an unknown previous state can be trusted), and onboards members recorded as pending
 * whose screening has since ended. Failures are logged and leave the state as it was.
 */
export async function syncGuildScreening(
  app: App,
  client: Client,
  guild: Guild,
): Promise<SyncResult> {
  const result: SyncResult = { recorded: 0, caughtUp: 0 };
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
          result.recorded++;
        }
      } else if (state.screeningPendingAt !== null && state.onboardedAt === null) {
        const config = await getConfig(app, guild.id);
        if (await onboard(app, client, member, config)) {
          result.caughtUp++;
        }
      }
    }
  } catch (error) {
    app.logger.error('Could not sync screening state', { guild: guild.id }, error);
  }
  return result;
}

/** Startup reconciliation of every guild the bot is in. */
export async function syncScreeningState(app: App, client: Client): Promise<SyncResult> {
  const total: SyncResult = { recorded: 0, caughtUp: 0 };
  for (const guild of client.guilds.cache.values()) {
    const result = await syncGuildScreening(app, client, guild);
    total.recorded += result.recorded;
    total.caughtUp += result.caughtUp;
  }
  app.logger.info('Synced screening state', { ...total });
  return total;
}
