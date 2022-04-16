import { Message, MessageEmbed } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { EmbedColours } from '../../resources/EmbedColours';
import { Command } from '../../types/Command';
import { ServerConfig } from '../../client/models/ServerConfig';
import { CommandAccess } from '../../utilities/CommandAccess';

const run = async (client: NovaClient, message: Message, config: ServerConfig, args: any[]): Promise<any> => {
	const embed = new MessageEmbed()
		.setThumbnail((client.user.displayAvatarURL()))
		.setTitle('Command Information')
		.setColor(EmbedColours.info)
		.setTimestamp();

	if(args.length < 1) {
		return message.channel.send('Please specify a command.');
	}

	const cmd = client.commands.get(args[0].toLowerCase());

	if (!cmd) {
		return message.channel.send('Command not found in this context.');
	}

	const commandAccess = new CommandAccess();
	const access = commandAccess.verifyAccess(cmd, message, config);

	if (!access.hasAccess) {
		return message.channel.send(access.reason);
	}

	embed.addField('Command', args[0].toLowerCase());
	embed.addField('Title', cmd.title);
	embed.addField('Description', cmd.description);
	embed.addField('Access', cmd.admin  ? 'Admin only' : cmd.limited ? 'Limited' : 'Everyone');
	if (cmd.limited)
		embed.addField('Limitation', cmd.limitation);
	embed.addField('Usage', config ? config.prefix + cmd.usage : cmd.usage);
	embed.addField('Example', config ? config.prefix + cmd.example : cmd.example);

	return message.channel.send({ embeds: [embed] });
};

const command: Command = {
	name: 'help',
	title: 'Command Help',
	description: 'Shows detailed help for a given command',
	usage: 'help <command>',
	example: 'help ping',
	admin: false,
	deleteCmd: false,
	limited: false,
	channels: ['GUILD_TEXT', 'DM'],
	run: run
};

export = command;