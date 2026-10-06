/*
 * BIRTHDAY CALENDAR SPEC
 *
 * Persisted state:
 *   ServerConfigs.birthdayCalendarMessagePath  "channelId/messageId" of the calendar message, or null.
 *   UserProfiles.birthdayMonth/Day             a member's birthday (the calendar's only data).
 * The path is written only by `/config birthdays create`, and only for a message the bot just sent
 * and edited successfully. It is cleared only by `remove` (after the message is deleted or
 * confirmed gone) or by a create that fails before replacing a previous calendar.
 *
 * Transitions (path state x event):
 *   none      create ok                 send, save path, populate, -> new path
 *   none      create fails              delete the new message, -> none
 *   old       create ok                 send, save, populate, delete old message, -> new path
 *   old       create fails (populate)   restore old path (if still ours), delete new msg, -> old
 *   old       create fails (send/save)  nothing saved, old calendar untouched, -> old
 *   old       remove, deleted/gone      -> none
 *   old       remove, delete fails      error with reason, -> old (retry, or create to replace it)
 *   any       refresh (sync, mybirthday, scheduled job, member leaves with a birthday)
 *                                       edit message in place; path never changes
 *
 * Invariants:
 *   1. A stored path always points to a message the bot created. A refresh that cannot reach it
 *      reports why (not-configured, channel-missing, message-missing, no-access, failed) and never
 *      clears or rewrites the path: only the admin commands do, so a transient error cannot lose it.
 *   2. Only definite "unknown channel/message" answers count as missing; permission errors are
 *      "no-access"; anything else (network, 5xx, rate limit) is "failed" and expected to recover.
 *   3. Refreshes of one guild run one at a time and read the profiles immediately before editing,
 *      so the last edit always reflects the latest data.
 *   4. A create never leaves two live calendars: the replaced message is deleted once the new one
 *      is populated, and a concurrent create's message is cleaned up by whichever finishes last.
 *   5. Background jobs only act on configs that still exist (a purged guild is skipped).
 *
 * Failure handling: deleting an old calendar that fails is logged and left in place (never blocks
 * the new calendar); a bot restart mid-create can leave an orphan placeholder message, which is
 * harmless; announcements missed while the bot is offline at the scheduled time are not replayed.
 */

import type { Client } from 'discord.js';
import { type Snowflake } from 'discord.js';
import { DateTime } from 'luxon';
import type { ServerConfig } from '../db/schema.ts';
import type { App } from '../app.ts';
import { findConfig, getConfigs } from './ConfigService.ts';
import { getServerBirthdays } from './UserProfileService.ts';
import { type BirthdayProfile, isBirthdayToday, upcoming } from './BirthdayDates.ts';
import { resolveMember, resolveTextChannel } from './MemberResolver.ts';

export type CalendarStatus =
  | 'updated'
  | 'not-configured'
  | 'channel-missing'
  | 'message-missing'
  | 'no-access'
  | 'failed';

const MESSAGE_LIMIT = 2000;
const SEPARATOR = '-------------';
const LOCALE = 'en-GB';

export const parseCalendarPath = (
  path: string | null | undefined,
): { channelId: Snowflake; messageId: Snowflake } | null => {
  const [channelId, messageId, ...rest] = (path ?? '').split('/');
  return channelId && messageId && rest.length === 0 ? { channelId, messageId } : null;
};

export const calendarMessageUrl = (guildId: Snowflake, path: string): string =>
  `https://discord.com/channels/${guildId}/${path}`;

export const buildCalendarContent = (
  profiles: readonly BirthdayProfile[],
  now: DateTime,
  zone: string,
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

const nowOf = (app: App): DateTime => DateTime.fromJSDate(app.clock());

const MISSING_CODES = new Set([10003, 10008]); // Unknown Channel, Unknown Message
const NO_ACCESS_CODES = new Set([50001, 50005, 50013]); // Missing Access, Cannot edit, Missing Permissions

const codeOf = (error: unknown): number | undefined => {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'number' ? code : undefined;
};

/** Only a definite Discord answer is "missing" or "no access"; anything else may recover. */
const statusOfError = (error: unknown, missing: CalendarStatus): CalendarStatus => {
  const code = codeOf(error);
  if (code !== undefined && MISSING_CODES.has(code)) {
    return missing;
  }
  return code !== undefined && NO_ACCESS_CODES.has(code) ? 'no-access' : 'failed';
};

const queues = new Map<Snowflake, Promise<unknown>>();

/** Runs tasks for one guild strictly one after another. */
const serialised = <T>(guild: Snowflake, task: () => Promise<T>): Promise<T> => {
  const run = (queues.get(guild) ?? Promise.resolve()).then(task, task);
  const tail = run.catch(() => undefined);
  queues.set(guild, tail);
  void tail.then(() => {
    if (queues.get(guild) === tail) {
      queues.delete(guild);
    }
  });
  return run;
};

export const refreshCalendar = (
  app: App,
  client: Client,
  config: ServerConfig,
): Promise<CalendarStatus> => {
  const target = parseCalendarPath(config.birthdayCalendarMessagePath);
  if (!target) {
    return Promise.resolve('not-configured');
  }
  return serialised(config.serverId, async () => {
    const guild = config.serverId;
    let stage: 'channel' | 'message' | 'edit' = 'channel';
    try {
      const channel = await client.channels.fetch(target.channelId);
      if (!channel?.isTextBased()) {
        return 'channel-missing';
      }
      stage = 'message';
      const message = await channel.messages.fetch(target.messageId);
      stage = 'edit';
      // Read the profiles last so this edit reflects everything saved before it.
      const profiles = (await getServerBirthdays(app.db, guild)).map((p) => ({
        userId: p.userId,
        month: p.birthdayMonth!,
        day: p.birthdayDay!,
      }));
      const content = buildCalendarContent(profiles, nowOf(app), app.env.timezone);
      await message.edit({ content, allowedMentions: { parse: [] } });
      return 'updated';
    } catch (error) {
      const status = statusOfError(
        error,
        stage === 'channel' ? 'channel-missing' : 'message-missing',
      );
      app.logger.warn(`Birthday calendar ${stage} step failed`, { guild, status }, error);
      return status;
    }
  });
};

export type DeleteCalendarStatus = 'deleted' | 'already-missing' | 'failed';

export const deleteCalendarMessage = async (
  app: App,
  client: Client,
  path: string | null | undefined,
): Promise<DeleteCalendarStatus> => {
  const target = parseCalendarPath(path);
  if (!target) {
    return 'already-missing';
  }
  try {
    const channel = await client.channels.fetch(target.channelId);
    if (!channel?.isTextBased()) {
      return 'already-missing';
    }
    const message = await channel.messages.fetch(target.messageId);
    if (!message) {
      return 'already-missing';
    }
    await message.delete();
    return 'deleted';
  } catch (error) {
    const code = codeOf(error);
    if (code !== undefined && MISSING_CODES.has(code)) {
      return 'already-missing';
    }
    app.logger.warn('Could not delete the birthday calendar message', { path }, error);
    return 'failed';
  }
};

export const refreshAllCalendars = async (app: App, client: Client): Promise<void> => {
  const { logger } = app;
  logger.info('Refreshing birthday calendars');
  const configs = await getConfigs(app.db);
  for (const listed of configs) {
    if (!listed.birthdayCalendarMessagePath) {
      continue;
    }
    try {
      // Re-read: the guild may have been purged, or its calendar recreated, since the listing.
      const config = await findConfig(app, listed.serverId);
      if (!config) {
        continue;
      }
      const status = await refreshCalendar(app, client, config);
      if (status !== 'updated') {
        logger.warn('Birthday calendar not updated', { guild: listed.serverId, status });
      }
    } catch (error) {
      logger.error('Birthday calendar refresh crashed', { guild: listed.serverId }, error);
    }
  }
};

const notifyGuild = async (
  app: App,
  client: Client,
  config: ServerConfig,
  now: DateTime,
): Promise<void> => {
  const { logger } = app;
  const zone = app.env.timezone;
  const guild =
    client.guilds.cache.get(config.serverId) ?? (await client.guilds.fetch(config.serverId));
  const channel = await resolveTextChannel(guild, config.announcementsChannelId!);
  if (!channel) {
    logger.warn('Announcements channel unavailable', { guild: config.serverId });
    return;
  }
  const profiles = await getServerBirthdays(app.db, config.serverId);
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
      logger.warn(
        'Could not resolve birthday member',
        { guild: config.serverId, user: profile.userId },
        error,
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

export const notifyBirthdays = async (app: App, client: Client): Promise<void> => {
  app.logger.info('Sending birthday notifications');
  const now = nowOf(app);
  const configs = await getConfigs(app.db);
  for (const config of configs) {
    if (!config.announcementsChannelId) {
      continue;
    }
    try {
      await notifyGuild(app, client, config, now);
    } catch (error) {
      app.logger.error('Birthday notification failed', { guild: config.serverId }, error);
    }
  }
};
