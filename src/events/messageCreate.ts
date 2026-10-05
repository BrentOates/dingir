import { GuildMember, Message, PermissionFlagsBits, type Snowflake } from 'discord.js';
import type { App } from '../app.ts';
import type { DingirClient } from '../client/DingirClient.ts';
import type { ServerConfig } from '../db/schema.ts';
import { defineEvent } from '../framework/event.ts';
import { EmbedColours } from '../resources/EmbedColours.ts';
import { memberAuditEmbed } from '../services/AuditEmbed.ts';
import { sendAudit } from '../services/AuditService.ts';
import { getConfig } from '../services/ConfigService.ts';
import { deleteUser, incrementActivityScore } from '../services/UserProfileService.ts';

const DELETE_MESSAGE_SECONDS = 7 * 24 * 60 * 60;

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const auditHoneypot = async (
  app: App,
  client: DingirClient,
  config: ServerConfig,
  member: GuildMember,
  channelId: Snowflake,
  description: string,
  action: string
): Promise<void> => {
  const audit = memberAuditEmbed(member, EmbedColours.negative, description)
    .addField('Member ID', member.id)
    .addField('Channel', `<#${channelId}>`)
    .addField('Action', action);
  await sendAudit(app, client, config, audit);
};

/** Returns true when the message was posted in the honeypot channel and has been dealt with. */
export const handleHoneypot = async (
  app: App,
  client: DingirClient,
  message: Message<true>,
  config: ServerConfig
): Promise<boolean> => {
  if (!config.honeyPotChannelId || config.honeyPotChannelId !== message.channelId) {
    return false;
  }

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member || member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (!app.honeypot.begin(message.guild.id, member.id)) {
    return true;
  }

  if (!member.bannable) {
    app.honeypot.cancel(message.guild.id, member.id);
    const error = 'The bot cannot ban this member because of its permissions or role hierarchy.';
    app.logger.error(`Honey-pot ban failed for ${member.id}.`, undefined, error);
    await auditHoneypot(app, client, config, member, message.channelId, 'Honey-pot ban failed', error);
    return true;
  }

  try {
    await member.ban({
      deleteMessageSeconds: DELETE_MESSAGE_SECONDS,
      reason: `Posted in honey-pot channel ${message.channelId}`,
    });
  } catch (error) {
    app.honeypot.cancel(message.guild.id, member.id);
    const errorMessage = formatError(error);
    app.logger.error(`Honey-pot ban failed for ${member.id}.`, undefined, errorMessage);
    await auditHoneypot(app, client, config, member, message.channelId, 'Honey-pot ban failed', errorMessage);
    return true;
  }

  await deleteUser(app.db, message.guild.id, member.id).catch((error) => {
    app.logger.error(
      `Could not delete profile data for honey-pot ban ${member.id}.`,
      undefined,
      formatError(error)
    );
  });
  await auditHoneypot(
    app,
    client,
    config,
    member,
    message.channelId,
    'Honey-pot triggered',
    "Banned and deleted the member's messages from the past 7 days."
  );
  return true;
};

export default defineEvent({
  name: 'messageCreate',
  run: async (app, client, message) => {
    if (!message.inGuild() || message.author.bot || message.webhookId || message.system) {
      return;
    }

    const config = await getConfig(app, message.guildId);
    if (await handleHoneypot(app, client, message, config)) {
      return;
    }

    await incrementActivityScore(app.db, message.guildId, message.author.id);
  },
});
