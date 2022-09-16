import { SlashCommandSubcommandGroupBuilder, SlashCommandSubcommandBuilder, ChatInputCommandInteraction, SlashCommandStringOption } from 'discord.js';
import { ServerConfig } from '../../../client/models/ServerConfig';
import { SlashSubGroupCommand } from '../../../types/SlashCommand';

const imageChoice = {
	name: 'Welcome Image', value: 'welcomeMessage'
};
const msgChoice = {
	name: 'Welcome Message', value: 'message'
};

const set = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
    config[cmd.options.getString('content')] = cmd.options.getString('value');
	config.save();

	return get(cmd, config);
};

const get = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	const value = config[cmd.options.getString('content')];

	return cmd.reply(`Current value is: ${value ? value : 'Not Set'}`);
};

const clear = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
    config[cmd.options.getString('content')] = null;
	config.save();

	return get(cmd, config);
};

const exec = async(cmd: ChatInputCommandInteraction, config: ServerConfig) => {
    const subCommand = cmd.options.getSubcommand();
    if (subCommand == 'set') {
		return set(cmd, config);
	} else if (subCommand == 'get') {
		return get(cmd, config);
	} else if (subCommand == 'clear') {
		return clear(cmd, config);
	} else {
		return cmd.reply('A valid option was not supplied for this command');
	}
};

const data = new SlashCommandSubcommandGroupBuilder()
	.setName('welcome')
	.setDescription('Control welcome information for this server')
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('set')
		.setDescription('Set\'s the welcome information for this server')
		.addStringOption((opt: SlashCommandStringOption) => opt
			.setName('content')
			.setDescription('Set the welcome image, or text?')
			.setRequired(true)
			.addChoices(imageChoice, msgChoice))
		.addStringOption((opt: SlashCommandStringOption) => opt
			.setName('value')
			.setDescription('URL to the welcome image, or the welcome text')
			.setRequired(true)))
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('get')
		.setDescription('Get\'s the welcome information for this server')
		.addStringOption((opt: SlashCommandStringOption) => opt
			.setName('content')
			.setDescription('Get the welcome image, or text?')
			.setRequired(true)
			.addChoices(imageChoice, msgChoice)))
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('clear')
		.setDescription('Clear\'s the welcome information for this server')
		.addStringOption((opt: SlashCommandStringOption) => opt
			.setName('content')
			.setDescription('Clear the welcome image, or text?')
			.setRequired(true)
			.addChoices(imageChoice, msgChoice)));

export const WelcomeCommand: SlashSubGroupCommand = {
	commandData: data,
	execute: exec
};