import { Attachment, Client, EmbedBuilder } from 'discord.js';
import { ServerConfig } from '../client/models/ServerConfig';
import { NovaClient } from '../client/NovaClient';
export class ChannelService {
  public static async sendAuditMessage(
    client: NovaClient | Client,
    serverConfig: ServerConfig,
    embed: EmbedBuilder,
    attachment?: Attachment
  ): Promise<boolean> {
    if (!serverConfig.auditChannelId) {
      return;
    }

    const auditChannel = client.channels.cache.get(serverConfig.auditChannelId);
    if (!auditChannel || !auditChannel.isSendable()) {
      return;
    }

    await auditChannel.send({
      embeds: [embed],
      files: attachment ? [attachment] : undefined
    });
  }
}
