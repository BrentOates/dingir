import { Message, PermissionFlagsBits } from 'discord.js';
import { NovaClient } from '../client/NovaClient';
import { EmbedColours } from '../resources/EmbedColours';
import { RunFunction } from '../types/Event';
import { EmbedCompatLayer } from '../types/EmbedCompatLayer';
import { ChannelService } from '../utilities/ChannelService';
import { ConfigService } from '../utilities/ConfigService';
import { HoneyPotEnforcementService } from '../utilities/HoneyPotEnforcementService';
import { Logger } from '../utilities/Logger';
import { UserProfileService } from '../utilities/UserProfileService';

const DELETE_MESSAGE_SECONDS = 7 * 24 * 60 * 60;

const formatError = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const sendAudit = async (
  client: NovaClient,
  message: Message,
  description: string,
  action: string
): Promise<void> => {
  const config = await ConfigService.getConfig(message.guild.id);
  const audit = new EmbedCompatLayer()
    .setColor(EmbedColours.negative)
    .setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(description)
    .addField('Member ID', message.author.id)
    .addField('Channel', message.channel.toString())
    .addField('Action', action)
    .setTimestamp();

  await ChannelService.sendAuditMessage(client, config, audit);
};

export const name = 'messageCreate';
export const run: RunFunction = async (
  client: NovaClient,
  message: Message
) => {
  if (!message.guild || message.author.bot) {
    return;
  }

  const config = await ConfigService.getConfig(message.guild.id);
  if (config.honeyPotChannelId !== message.channelId) {
    return;
  }

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member || member.permissions.has(PermissionFlagsBits.Administrator)) {
    return;
  }

  if (!HoneyPotEnforcementService.begin(message.guild.id, member.id)) {
    return;
  }

  if (!member.bannable) {
    HoneyPotEnforcementService.cancel(message.guild.id, member.id);
    const error = 'The bot cannot ban this member because of its permissions or role hierarchy.';
    Logger.writeError(`Honey-pot ban failed for ${member.id}.`, error);
    await sendAudit(client, message, 'Honey-pot ban failed', error).catch((auditError) => {
      Logger.writeError('Could not send honey-pot failure audit.', formatError(auditError));
    });
    return;
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
    await sendAudit(client, message, 'Honey-pot ban failed', errorMessage).catch((auditError) => {
      Logger.writeError('Could not send honey-pot failure audit.', formatError(auditError));
    });
    return;
  }

  await UserProfileService.deleteUser(message.guild.id, member.id).catch((error) => {
    Logger.writeError(`Could not delete profile data for honey-pot ban ${member.id}.`, formatError(error));
  });
  await sendAudit(
    client,
    message,
    'Honey-pot triggered',
    'Banned and deleted the member\'s messages from the past 7 days.'
  ).catch((error) => {
    Logger.writeError('Could not send honey-pot success audit.', formatError(error));
  });
};
