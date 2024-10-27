import { ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { EmbedColours } from '../../resources/EmbedColours';
import { EmbedCompatLayer } from '../../types/EmbedCompatLayer';
import { SlashCommand } from '../../types/SlashCommand';
import * as packageJson from '../../../package.json';

const execute = async (cmd: ChatInputCommandInteraction) => {
	const version = packageJson.version;
	const projectUrl = packageJson.repository;

	const embed = new EmbedCompatLayer()
		.setColor(EmbedColours.positive)
		.setAuthor({
			name: cmd.client.user.tag,
			iconURL: cmd.client.user.displayAvatarURL(),
			})
		.setDescription('Dingir Discord Bot')
		.addField('Version', version.length > 0 ? version : 'Unknown')
		.addField('Project URL', projectUrl.url)
		.addField('Servers', cmd.client.guilds.cache.size.toString())
		.setTimestamp();

	return cmd.reply({
		embeds: [embed],
		ephemeral: true
	});
};

const commandData = new SlashCommandBuilder()
	.setName('about')
	.setDescription('Returns info about the bot and server')
	.setContexts([InteractionContextType.Guild]);

const slashCommand: SlashCommand = {
	commandData: commandData,
	execute: execute
};
export = slashCommand;