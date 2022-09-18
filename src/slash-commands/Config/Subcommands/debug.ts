import { SlashCommandSubcommandGroupBuilder, SlashCommandSubcommandBuilder, ChatInputCommandInteraction, SlashCommandBooleanOption } from 'discord.js';
import { ServerConfig } from '../../../client/models/ServerConfig';
import { SlashSubGroupCommand } from '../../../types/SlashCommand';

const set = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
    const value = cmd.options.getBoolean('enabled');
	config.debug = value;
	config.save();

	return get(cmd, config);
};

const get = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	const value = config.debug;

	return cmd.reply({
		content: `Debug mode is: ${value ? 'enabled' : 'disabled'}`,
		ephemeral: true 
	});
};

const exec = async(cmd: ChatInputCommandInteraction, config: ServerConfig) => {
    const subCommand = cmd.options.getSubcommand();
    if (subCommand == 'set') {
		return set(cmd, config);
	} else if (subCommand == 'get') {
		return get(cmd, config);
	} else {
		return cmd.reply({
			content: 'A valid option was not supplied for this command',
			ephemeral: true
		});
	}
};

const data = new SlashCommandSubcommandGroupBuilder()
	.setName('debug')
	.setDescription('Toggle the debugging mode for this server')
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('set')
		.setDescription('Set\'s whether debug mode is enabled for this server')
		.addBooleanOption((opt: SlashCommandBooleanOption) => opt
			.setName('enabled')
			.setDescription('Whether to enable debug mode or not')
			.setRequired(true)))
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('get')
		.setDescription('Get\'s whether debug mode is enabled or not'));

export const DebugCommand: SlashSubGroupCommand = {
	commandData: data,
	execute: exec
};