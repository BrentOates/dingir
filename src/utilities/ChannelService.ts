import { Attachment, Client, EmbedBuilder } from 'discord.js';
import { ServerConfig } from '../client/models/ServerConfig';
import { NovaClient } from '../client/NovaClient';
import { sendAudit } from '../services/AuditService';

export class ChannelService {
  public static async sendAuditMessage(
    client: NovaClient | Client,
    serverConfig: ServerConfig,
    embed: EmbedBuilder,
    attachment?: Attachment
  ): Promise<boolean> {
    return sendAudit(client, serverConfig, embed, attachment ? [attachment] : undefined);
  }
}
