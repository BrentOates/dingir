import { ChannelType, Client, EmbedBuilder, TextChannel } from 'discord.js';
import { ServerConfig } from '../client/models/ServerConfig';
import { NovaClient } from '../client/NovaClient';

export class ChannelService {
  public static async sendAuditMessage(
    client: NovaClient | Client,
    serverConfig: ServerConfig,
    embed: EmbedBuilder
  ): Promise<boolean> {
    if (!serverConfig.auditChannelId) {
      return;
    }

    const auditChannel = client.channels.cache.get(serverConfig.auditChannelId);
    if (!auditChannel || auditChannel.type !== ChannelType.GuildText) {
      return;
    }

    await (auditChannel as TextChannel).send({
      embeds: [embed],
    });
  }
}
