/*
 * DATA RETENTION SPEC
 *
 * Persisted state:
 *   ServerConfigs   one row per guild; accessFailureCount / firstAccessFailureAt count consecutive
 *                   "gone" answers (Unknown Guild / Missing Access) from the scheduled data check.
 *   UserProfiles    per (guild, user) member data, deleted when the member leaves.
 *
 * Deletion paths and their triggers (nothing else may delete a guild's data):
 *   guildDelete            Discord says the bot was removed          purge the guild at once
 *   guildMemberRemove      the member left                           delete that member's profile
 *   data check, gone       guild fetch says gone, count >= N and     purge the guild
 *                          first failure >= G days ago (RetentionPolicy)
 *   data check, members    profile row read BEFORE the member list   delete those rows by row id
 *                          was fetched, and its user is not in it
 * Events: guildCreate resets the failure counters (and re-records pending screenings).
 *
 * Transitions of the data check, per config row (outcome of fetching the guild):
 *   ok         reset counters, then clean departed members' profiles
 *   transient  (any other error)  change nothing and delete nothing
 *   gone       count + 1; purge only past both thresholds, otherwise just record the count
 *
 * Invariants:
 *   1. A transient error never changes counters or deletes data; only a definite "gone" answer,
 *      repeated over a grace period, can purge, and a guild the gateway still lists never is.
 *   2. Background jobs never create rows: counters are written with updateExistingConfig, and the
 *      config is re-read per guild, so a guild purged by a concurrent guildDelete is skipped.
 *      purgeGuild is one transaction and idempotent, so racing purges are harmless.
 *   3. Member cleanup never deletes a profile created after it read the profiles (joiners during
 *      the slow member fetch, or a member who left and rejoined), and never runs on an empty
 *      member list.
 *   4. A failure in one guild is logged and does not stop the others.
 */

import type { Client } from 'discord.js';
import { type Snowflake } from 'discord.js';
import type { App } from '../app.ts';
import { findConfig, getConfigs, purgeGuild, updateExistingConfig } from './ConfigService.ts';
import { deleteProfiles, getServerProfiles } from './UserProfileService.ts';
import {
  type AccessOutcome,
  type RetentionPolicyConfig,
  classifyGuildFetchError,
  nextAccessState,
} from './RetentionPolicy.ts';

const cleanMembers = async (app: App, client: Client, serverId: Snowflake): Promise<void> => {
  const guild = await client.guilds.fetch(serverId);
  // Snapshot the profiles first: anyone who joins during the (slow) member fetch gets a profile
  // that is missing from the fetched list, and must survive until the next run.
  const profiles = await getServerProfiles(app.db, serverId);
  const members = await guild.members.fetch();
  if (members.size === 0) {
    app.logger.warn('Member list empty; skipping profile cleanup', { guild: serverId });
    return;
  }
  const departed = profiles.filter((p) => !members.has(p.userId)).map((p) => p.id);
  if (departed.length > 0) {
    const removed = await deleteProfiles(app.db, serverId, departed);
    app.logger.info('Removed profiles of departed members', { guild: serverId, removed });
  }
};

export const runDataCheck = async (
  app: App,
  client: Client,
  policy: RetentionPolicyConfig = {
    minFailures: app.env.purgeMinFailures,
    graceDays: app.env.purgeGraceDays,
  },
): Promise<void> => {
  const { logger } = app;
  const now = app.clock();
  logger.info('Running data check');
  const configs = await getConfigs(app.db);
  for (const listed of configs) {
    const guild = listed.serverId;
    try {
      // Re-read: a guildDelete may have purged this guild since the list was taken.
      const config = await findConfig(app, guild);
      if (!config) {
        logger.debug('Config removed before data check; skipping guild', { guild });
        continue;
      }
      let outcome: AccessOutcome = 'ok';
      try {
        await client.guilds.fetch(guild);
      } catch (error) {
        outcome = classifyGuildFetchError(error);
        logger.warn('Guild fetch failed', { guild, outcome }, error);
      }

      const next = nextAccessState(
        {
          accessFailureCount: config.accessFailureCount,
          firstAccessFailureAt: config.firstAccessFailureAt,
        },
        outcome,
        now,
        policy,
      );

      if (next.purge) {
        if (client.guilds.cache.has(guild)) {
          // The gateway says the bot is in this guild, so the fetch result was stale.
          logger.warn('Guild is in the gateway cache; not purging', { guild });
          continue;
        }
        const result = await purgeGuild(app, guild);
        logger.warn('Purged guild after sustained loss of access', {
          guild,
          failures: next.accessFailureCount,
          config: result.config,
          profiles: result.profiles,
        });
        continue;
      }

      if (
        next.accessFailureCount !== config.accessFailureCount ||
        next.firstAccessFailureAt?.getTime() !== config.firstAccessFailureAt?.getTime()
      ) {
        const updated = await updateExistingConfig(app, config.serverId, {
          accessFailureCount: next.accessFailureCount,
          firstAccessFailureAt: next.firstAccessFailureAt,
        });
        if (!updated) {
          logger.debug('Config removed during data check; skipping guild', { guild });
          continue;
        }
      }

      if (outcome === 'ok') {
        await cleanMembers(app, client, guild);
      }
    } catch (error) {
      logger.error('Data check failed for guild', { guild }, error);
    }
  }
  logger.info('Data check complete');
};
