import { Attachment, Client, EmbedBuilder } from 'discord.js';
import type { ServerConfig } from '../client/database/schema';
import { Logger } from '../utilities/Logger';

export const sendAudit = async (
  client: Client,
  config: ServerConfig,
  embed: EmbedBuilder,
  files?: Attachment[]
): Promise<boolean> => {
  const channelId = config.auditChannelId;
  if (!channelId) {
    return false;
  }
  const context = { guildId: config.serverId, channelId };

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isSendable()) {
      Logger.warn('Audit channel missing or not sendable', context);
      return false;
    }
    await channel.send({ embeds: [embed], files: files?.length ? files : undefined });
    return true;
  } catch (error) {
    Logger.warn('Failed to send audit message', context, error);
    return false;
  }
};
