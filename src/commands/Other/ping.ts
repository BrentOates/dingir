import { ChannelType, Message } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { Command } from '../../types/Command';
import * as packageJson from '../../../package.json';
import { EmbedColours } from '../../resources/EmbedColours';
import { EmbedCompatLayer } from '../../types/EmbedCompatLayer';

const run = async (client: NovaClient, message: Message): Promise<any> => {
	const version = packageJson.version;

	const embed = new EmbedCompatLayer()
		.setColor(EmbedColours.positive)
		.setAuthor({
			name: client.user.tag, iconURL: client.user.displayAvatarURL() 
		})
		.setDescription('Pong!')
		.addField('Version', version.length > 0 ? version : 'Unknown')
		.addField('Servers', client.guilds.cache.size.toString())
		.setTimestamp();

	message.channel.send({
		embeds: [embed]  
	});
};

const command: Command = {
	name: 'ping',
	title: 'Ping',
	description: 'Ping Pong command (Useful for testing too!).',
	usage: 'ping',
	example: 'ping',
	admin: false,
	deleteCmd: false,
	limited: false,
	channels: [ChannelType.GuildText, ChannelType.DM],
	run: run
};

export = command;
