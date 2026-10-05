import { Attachment, Client, EmbedBuilder } from 'discord.js';
import type { App } from '../app.ts';
import type { ServerConfig } from '../db/schema.ts';

export const sendAudit = async (
  app: App,
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
      app.logger.warn('Audit channel missing or not sendable', context);
      return false;
    }
    await channel.send({ embeds: [embed], files: files?.length ? files : undefined });
    return true;
  } catch (error) {
    app.logger.warn('Failed to send audit message', context, error);
    return false;
  }
};
