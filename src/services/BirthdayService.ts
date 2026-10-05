import { Client } from 'discord.js';
import { DateTime } from 'luxon';
import type { ServerConfig } from '../db/schema.ts';
import { env } from '../config/env.ts';
import { ConfigService } from '../services/ConfigService.ts';
import { Logger } from '../utilities/Logger.ts';
import { UserProfileService } from '../services/UserProfileService.ts';
import { type BirthdayProfile, isBirthdayToday, upcoming } from './BirthdayDates.ts';
import { resolveMember, resolveTextChannel } from './MemberResolver.ts';

export type CalendarStatus =
  | 'updated'
  | 'not-configured'
  | 'channel-missing'
  | 'message-missing'
  | 'failed';

export interface BirthdayOptions {
  now?: DateTime;
  zone?: string;
}

const MESSAGE_LIMIT = 2000;
const SEPARATOR = '-------------';
const LOCALE = 'en-GB';

export const parseCalendarPath = (
  path: string | null | undefined
): { channelId: string; messageId: string } | null => {
  const [channelId, messageId, ...rest] = (path ?? '').split('/');
  return channelId && messageId && rest.length === 0 ? { channelId, messageId } : null;
};

export const calendarMessageUrl = (guildId: string, path: string): string =>
  `https://discord.com/channels/${guildId}/${path}`;

export const buildCalendarContent = (
  profiles: readonly BirthdayProfile[],
  now: DateTime,
  zone: string
): string => {
  const groups = upcoming(profiles, now, zone);
  let content = ':tada: ~ Upcoming Birthdays ~ :tada:\n';
  if (groups.length === 0) {
    return `${content}${SEPARATOR}\nThere are no birthdays in this server, set yours with \`/mybirthday set\``;
  }
  content += "Here's the next birthdays in this guild!\n";
  content += 'Set yours with `/mybirthday set`\n';
  content += SEPARATOR;
  for (const group of groups) {
    const date = group.date.setLocale(LOCALE).toLocaleString(DateTime.DATE_FULL);
    const section = `\n**${date}**\n${group.userIds.map((id) => `<@${id}>`).join('\n')}\n${SEPARATOR}`;
    if (content.length + section.length > MESSAGE_LIMIT) {
      break;
    }
    content += section;
  }
  return content;
};

export const refreshCalendar = async (
  client: Client,
  config: ServerConfig,
  opts: BirthdayOptions = {}
): Promise<CalendarStatus> => {
  const guild = config.serverId;
  const target = parseCalendarPath(config.birthdayCalendarMessagePath);
  if (!target) {
    return 'not-configured';
  }
  try {
    const channel = await client.channels.fetch(target.channelId).catch((error: unknown) => {
      Logger.warn('Birthday calendar channel fetch failed', { guild }, error);
      return null;
    });
    if (!channel || !channel.isTextBased()) {
      return 'channel-missing';
    }
    const message = await channel.messages.fetch(target.messageId).catch((error: unknown) => {
      Logger.warn('Birthday calendar message fetch failed', { guild }, error);
      return null;
    });
    if (!message) {
      return 'message-missing';
    }
    const profiles = (await UserProfileService.getServerBirthdays(guild)).map((p) => ({
      userId: p.userId,
      month: p.birthdayMonth!,
      day: p.birthdayDay!,
    }));
    const content = buildCalendarContent(
      profiles,
      opts.now ?? DateTime.now(),
      opts.zone ?? env.timezone
    );
    await message.edit({ content, allowedMentions: { parse: [] } });
    return 'updated';
  } catch (error) {
    Logger.error('Birthday calendar refresh failed', { guild }, error);
    return 'failed';
  }
};

export const deleteCalendarMessage = async (
  client: Client,
  path: string | null | undefined
): Promise<void> => {
  const target = parseCalendarPath(path);
  if (!target) {
    return;
  }
  try {
    const channel = await client.channels.fetch(target.channelId);
    if (channel?.isTextBased()) {
      const message = await channel.messages.fetch(target.messageId);
      await message.delete();
    }
  } catch {
    // best effort: the message may already be gone
  }
};

export const refreshAllCalendars = async (
  client: Client,
  opts: BirthdayOptions = {}
): Promise<void> => {
  Logger.info('Refreshing birthday calendars');
  const configs = await ConfigService.getConfigs();
  for (const config of configs) {
    if (!config.birthdayCalendarMessagePath) {
      continue;
    }
    try {
      const status = await refreshCalendar(client, config, opts);
      if (status !== 'updated') {
        Logger.warn('Birthday calendar not updated', { guild: config.serverId, status });
      }
    } catch (error) {
      Logger.error('Birthday calendar refresh crashed', { guild: config.serverId }, error);
    }
  }
};

const notifyGuild = async (
  client: Client,
  config: ServerConfig,
  now: DateTime,
  zone: string
): Promise<void> => {
  const guild =
    client.guilds.cache.get(config.serverId) ?? (await client.guilds.fetch(config.serverId));
  const channel = await resolveTextChannel(guild, config.announcementsChannelId!);
  if (!channel) {
    Logger.warn('Announcements channel unavailable', { guild: config.serverId });
    return;
  }
  const profiles = await UserProfileService.getServerBirthdays(config.serverId);
  const ids: string[] = [];
  for (const profile of profiles) {
    if (!isBirthdayToday(profile.birthdayMonth!, profile.birthdayDay!, now, zone)) {
      continue;
    }
    try {
      if (await resolveMember(guild, profile.userId)) {
        ids.push(profile.userId);
      }
    } catch (error) {
      Logger.warn(
        'Could not resolve birthday member',
        { guild: config.serverId, user: profile.userId },
        error
      );
    }
  }
  if (ids.length === 0) {
    return;
  }
  await channel.send({
    content: `Happy Birthday to ${ids.map((id) => `<@${id}>`).join(', ')}!`,
    allowedMentions: { users: ids },
  });
};

export const notifyBirthdays = async (
  client: Client,
  opts: BirthdayOptions = {}
): Promise<void> => {
  Logger.info('Sending birthday notifications');
  const now = opts.now ?? DateTime.now();
  const zone = opts.zone ?? env.timezone;
  const configs = await ConfigService.getConfigs();
  for (const config of configs) {
    if (!config.announcementsChannelId) {
      continue;
    }
    try {
      await notifyGuild(client, config, now, zone);
    } catch (error) {
      Logger.error('Birthday notification failed', { guild: config.serverId }, error);
    }
  }
};
