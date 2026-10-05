import { Client } from 'discord.js';
import { env } from '../config/env';
import { ConfigService } from '../utilities/ConfigService';
import { Logger } from '../utilities/Logger';
import { UserProfileService } from '../utilities/UserProfileService';
import {
  AccessOutcome,
  RetentionPolicyConfig,
  classifyGuildFetchError,
  nextAccessState,
} from './RetentionPolicy';

const cleanMembers = async (
  client: Client,
  serverId: string
): Promise<void> => {
  const guild = await client.guilds.fetch(serverId);
  const members = await guild.members.fetch();
  if (members.size === 0) {
    Logger.warn('Member list empty; skipping profile cleanup', { guild: serverId });
    return;
  }
  const profiles = await UserProfileService.getServerProfiles(serverId);
  const departed = profiles.filter((p) => !members.has(p.userId)).map((p) => p.userId);
  if (departed.length > 0) {
    const removed = await UserProfileService.deleteUsers(serverId, departed);
    Logger.info('Removed profiles of departed members', { guild: serverId, removed });
  }
};

export const run = async (
  client: Client,
  now: Date = new Date(),
  policy: RetentionPolicyConfig = {
    minFailures: env.purgeMinFailures,
    graceDays: env.purgeGraceDays,
  }
): Promise<void> => {
  Logger.info('Running data check');
  const configs = await ConfigService.getConfigs();
  for (const config of configs) {
    const guild = config.serverId;
    try {
      let outcome: AccessOutcome = 'ok';
      try {
        await client.guilds.fetch(guild);
      } catch (error) {
        outcome = classifyGuildFetchError(error);
        Logger.warn('Guild fetch failed', { guild, outcome }, error);
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
        const result = await ConfigService.purgeGuild(guild);
        Logger.warn('Purged guild after sustained loss of access', {
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
        config.accessFailureCount = next.accessFailureCount;
        config.firstAccessFailureAt = next.firstAccessFailureAt;
        await config.save();
      }

      if (outcome === 'ok') {
        await cleanMembers(client, guild);
      }
    } catch (error) {
      Logger.error('Data check failed for guild', { guild }, error);
    }
  }
  Logger.info('Data check complete');
};
