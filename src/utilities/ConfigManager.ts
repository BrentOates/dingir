import { ChannelType, Message } from 'discord.js';
import { ServerConfig } from '../client/models/ServerConfig';

export class ConfigManager {
	public static async updateChannel (serverConfig: ServerConfig, message: Message, field: string): Promise<Message> {
		const chan = message.mentions.channels.first();

		let messageContent: string;
		if(!chan && serverConfig[field]) {
			serverConfig[field] = null;
		} else if (!chan && !serverConfig[field]) {
			messageContent = 'Please tag the channel.';
		} else if (!chan) {
			messageContent = 'Channel not found, or I do not have permission to access it.';
		} else if (chan.type !== ChannelType.GuildText && chan.type !== ChannelType.GuildNews) {
			messageContent = 'Channel must be a Text Channel.';
		} 

		if (messageContent) {
			return message.channel.send({
				content: messageContent 
			});
		}
    
		if (chan) {
			serverConfig[field] = chan.id;
		}

		await serverConfig.save();
    
		if (serverConfig[field]) {
			return message.channel.send({
				content: `Channel updated to ${chan.toString()}.` 
			});
		} else {
			return message.channel.send({
				content: 'Channel disabled.' 
			});
		}
	}
}
