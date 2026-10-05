import { Client, type Snowflake } from 'discord.js';
import type { App } from '../app.ts';
import { getConfigs, purgeGuild, updateConfig } from './ConfigService.ts';
import { deleteUsers, getServerProfiles } from './UserProfileService.ts';
import {
  type AccessOutcome,
  type RetentionPolicyConfig,
  classifyGuildFetchError,
  nextAccessState,
} from './RetentionPolicy.ts';

const cleanMembers = async (app: App, client: Client, serverId: Snowflake): Promise<void> => {
  const guild = await client.guilds.fetch(serverId);
  const members = await guild.members.fetch();
  if (members.size === 0) {
    app.logger.warn('Member list empty; skipping profile cleanup', { guild: serverId });
    return;
  }
  const profiles = await getServerProfiles(app.db, serverId);
  const departed = profiles.filter((p) => !members.has(p.userId)).map((p) => p.userId);
  if (departed.length > 0) {
    const removed = await deleteUsers(app.db, serverId, departed);
    app.logger.info('Removed profiles of departed members', { guild: serverId, removed });
  }
};

export const runDataCheck = async (
  app: App,
  client: Client,
  policy: RetentionPolicyConfig = {
    minFailures: app.env.purgeMinFailures,
    graceDays: app.env.purgeGraceDays,
  }
): Promise<void> => {
  const { logger } = app;
  const now = app.clock();
  logger.info('Running data check');
  const configs = await getConfigs(app.db);
  for (const config of configs) {
    const guild = config.serverId;
    try {
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
        policy
      );

      if (next.purge) {
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
        await updateConfig(app, config.serverId, {
          accessFailureCount: next.accessFailureCount,
          firstAccessFailureAt: next.firstAccessFailureAt,
        });
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
