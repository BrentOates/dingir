import { GuildMember, Message, PermissionFlagsBits } from 'discord.js';
import type { DingirClient } from '../client/DingirClient.ts';
import type { ServerConfig } from '../db/schema.ts';
import { defineEvent } from '../framework/event.ts';
import { EmbedColours } from '../resources/EmbedColours.ts';
import { AuditEmbed } from '../services/AuditEmbed.ts';
import { sendAudit } from '../services/AuditService.ts';
import { ConfigService } from '../services/ConfigService.ts';
import { HoneyPotEnforcementService } from '../services/HoneyPotEnforcementService.ts';
import { Logger } from '../utilities/Logger.ts';
import { UserProfileService } from '../services/UserProfileService.ts';

const DELETE_MESSAGE_SECONDS = 7 * 24 * 60 * 60;

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const auditHoneypot = async (
  client: DingirClient,
  config: ServerConfig,
  member: GuildMember,
  channelId: string,
  description: string,
  action: string
): Promise<void> => {
  const audit = AuditEmbed.forMember(member, EmbedColours.negative, description)
    .addField('Member ID', member.id)
    .addField('Channel', `<#${channelId}>`)
    .addField('Action', action);
  await sendAudit(client, config, audit);
};

/** Returns true when the message was posted in the honeypot channel and has been dealt with. */
export const handleHoneypot = async (
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

  if (!HoneyPotEnforcementService.begin(message.guild.id, member.id)) {
    return true;
  }

  if (!member.bannable) {
    HoneyPotEnforcementService.cancel(message.guild.id, member.id);
    const error = 'The bot cannot ban this member because of its permissions or role hierarchy.';
    Logger.writeError(`Honey-pot ban failed for ${member.id}.`, error);
    await auditHoneypot(client, config, member, message.channelId, 'Honey-pot ban failed', error);
    return true;
  }

  try {
    await member.ban({
      deleteMessageSeconds: DELETE_MESSAGE_SECONDS,
      reason: `Posted in honey-pot channel ${message.channelId}`,
    });
  } catch (error) {
    HoneyPotEnforcementService.cancel(message.guild.id, member.id);
    const errorMessage = formatError(error);
    Logger.writeError(`Honey-pot ban failed for ${member.id}.`, errorMessage);
    await auditHoneypot(client, config, member, message.channelId, 'Honey-pot ban failed', errorMessage);
    return true;
  }

  await UserProfileService.deleteUser(message.guild.id, member.id).catch((error) => {
    Logger.writeError(`Could not delete profile data for honey-pot ban ${member.id}.`, formatError(error));
  });
  await auditHoneypot(
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
  run: async (client, message) => {
    if (!message.inGuild() || message.author.bot || message.webhookId || message.system) {
      return;
    }

    const config = await ConfigService.getConfig(message.guildId);
    if (await handleHoneypot(client, message, config)) {
      return;
    }

    await UserProfileService.incrementActivityScore(message.guildId, message.author.id);
  },
});
