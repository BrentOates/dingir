import { SlashCommandSubcommandGroupBuilder, SlashCommandSubcommandBuilder, ChatInputCommandInteraction, SlashCommandBooleanOption } from 'discord.js';
import { ServerConfig } from '../../../client/models/ServerConfig';
import { SlashSubGroupCommand } from '../../../types/SlashCommand';

const set = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
    const value = cmd.options.getBoolean('enabled');
	config.systemMessagesEnabled = value;
	config.save();

	return get(cmd, config);
};

const get = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	const value = config.debug;

	return cmd.reply(`Bot System messages are: ${value ? 'enabled' : 'disabled'}`);
};

const exec = async(cmd: ChatInputCommandInteraction, config: ServerConfig) => {
    const subCommand = cmd.options.getSubcommand();
    if (subCommand == 'set') {
		return set(cmd, config);
	} else if (subCommand == 'get') {
		return get(cmd, config);
	} else {
		return cmd.reply('A valid option was not supplied for this command');
	}
};

const data = new SlashCommandSubcommandGroupBuilder()
	.setName('sysmsgs')
	.setDescription('Toggle Bot created System Messages for this server')
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('set')
		.setDescription('Set\'s whether system messages are posted in the default channel for this server')
		.addBooleanOption((opt: SlashCommandBooleanOption) => opt
			.setName('enabled')
			.setDescription('Whether to post bot created system messages or not')
			.setRequired(true)))
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('get')
		.setDescription('Get\'s whether bot created system messages are posted or not'));

export const SystemMessagesCommand: SlashSubGroupCommand = {
	commandData: data,
	execute: exec
};