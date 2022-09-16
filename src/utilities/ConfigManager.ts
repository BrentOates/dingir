import { ChannelType, ChatInputCommandInteraction, InteractionResponse } from 'discord.js';
import { ServerConfig } from '../client/models/ServerConfig';

export class ConfigManager {
	public static async updateChannel (serverConfig: ServerConfig, interaction: ChatInputCommandInteraction, field: string): Promise<InteractionResponse> {
		const chan = interaction.options.getChannel('channel');

    let messageContent: string;
    if (!chan && serverConfig[field]) {
      serverConfig[field] = null;
    } else if (!chan && !serverConfig[field]) {
      messageContent = 'Please tag the channel.';
    } else if (!chan) {
      messageContent =
        'Channel not found, or I do not have permission to access it.';
    } else if (
      chan.type !== ChannelType.GuildText &&
      chan.type !== ChannelType.GuildNews
    ) {
      messageContent = 'Channel must be a Text Channel.';
    }

		if (messageContent) {
			return interaction.reply ({
				content: messageContent,
				ephemeral: true
			});
		}
    
		if (chan) {
			serverConfig[field] = chan.id;
		}

		await serverConfig.save();
    
		if (serverConfig[field]) {
			return interaction.reply ({
				content: `Channel updated to ${chan.toString()}.`,
				ephemeral: true
			});
		} else {
			return interaction.reply ({
				content: 'Channel disabled.',
				ephemeral: true
			});
		}
	}
}
