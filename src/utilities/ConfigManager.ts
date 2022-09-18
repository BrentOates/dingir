import { ChannelType, ChatInputCommandInteraction, InteractionResponse } from 'discord.js';
import { ServerConfig } from '../client/models/ServerConfig';

export class ConfigManager {
	public static async updateChannel(serverConfig: ServerConfig, interaction: ChatInputCommandInteraction, field: string): Promise<InteractionResponse> {
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
			return interaction.reply({
				content: messageContent,
				ephemeral: true
			});
		}

		if (chan) {
			serverConfig[field] = chan.id;
		}

		await serverConfig.save();

		if (serverConfig[field]) {
			return interaction.reply({
				content: `Channel updated to ${chan.toString()}.`,
				ephemeral: true
			});
		} else {
			return interaction.reply({
				content: 'Channel disabled.',
				ephemeral: true
			});
		}
	}

	public static async getChannel(interaction: ChatInputCommandInteraction, serverConfig: ServerConfig, field: string) {
		if (serverConfig[field]) {
			return interaction.guild.channels.cache.get(serverConfig[field]);
		}

		return null;
	}

	public static async updateChannelNew(interaction: ChatInputCommandInteraction, serverConfig: ServerConfig, field: string) {
		const chan = interaction.options.getChannel('channel');
		if (!chan) {
			return interaction.reply('Provided channel is not valid');
		}
		serverConfig[field] = chan.id;
		serverConfig.save();

		return chan;
	}

	public static async clearChannel(serverConfig: ServerConfig, field: string) {
		serverConfig[field] = null;
		serverConfig.save();
	}
}
