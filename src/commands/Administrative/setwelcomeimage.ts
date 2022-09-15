import { ChannelType, Message } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { Command } from '../../types/Command';
import { ServerConfig } from '../../client/models/ServerConfig';
import { ChannelService } from '../../utilities/ChannelService';
import { EmbedColours } from '../../resources/EmbedColours';
import { EmbedCompatLayer } from '../../types/EmbedCompatLayer';

const run = async (client: NovaClient, message: Message, config: ServerConfig, args: any[]): Promise<any> => {
	const oldValue = config.welcomeMessageBackgroundUrl;
	const newValue = args[0];

	if (!newValue) {
		if (config.welcomeMessageBackgroundUrl){
			return message.channel.send(`**Current Welcome Message Image**\n${config.welcomeMessageBackgroundUrl}`);
		} else {
			return message.channel.send('Welcome Message Image not set');
		}
	}

	if (newValue === 'unset') {
		config.welcomeMessageBackgroundUrl = null;
	} else {
		config.welcomeMessageBackgroundUrl = newValue;
	}

	await config.save();

	const audit = new EmbedCompatLayer()
		.setColor(EmbedColours.neutral)
		.setAuthor({
			name: message.author.tag, iconURL: message.author.displayAvatarURL() 
		})
		.setDescription(`Welcome Message Image ${!config.welcomeMessageBackgroundUrl ? 'Removed' : 'Updated'}`)
		.addField('New Welcome Message Image', !config.welcomeMessageBackgroundUrl ? 'Not set' : config.welcomeMessageBackgroundUrl)
		.addField('Old Welcome Message Image', !oldValue ? 'Not set' : oldValue)
		.setTimestamp();

	await ChannelService.sendAuditMessage(client, config, audit);

	return message.channel.send({
		content: config.welcomeMessageBackgroundUrl ? 'Welcome image updated.' : 'Welcome image removed.'
	});
};

const command: Command = {
	name: 'setwelcomeimage',
	title: 'Sets the image used for welcome posts.',
	description: 'Sets the image used for welcome posts.',
	usage: 'setwelcomeimage <url>',
	example: 'setwelcomeimage <url>',
	admin: true,
	deleteCmd: false,
	limited: false,
	channels: [ChannelType.GuildText],
	run: run
};

export = command;
