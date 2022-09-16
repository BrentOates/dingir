import { SlashCommandSubcommandGroupBuilder, SlashCommandSubcommandBuilder, SlashCommandChannelOption, ChatInputCommandInteraction } from 'discord.js';
import { ServerConfig } from '../../../client/models/ServerConfig';
import { SlashSubGroupCommand } from '../../../types/SlashCommand';
import { ConfigManager } from '../../../utilities/ConfigManager';

const set = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
    ConfigManager.updateChannelNew(cmd, config, 'auditChannelId');
	return get(cmd, config);
};

const get = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	const channel = ConfigManager.getChannel(cmd, config, 'auditChannelId');
	return cmd.reply(`The audit channel for this server is: ${channel ? channel.toString() : 'Not Set'}`);
};

const clear = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	ConfigManager.clearChannel(config, 'auditChannelId');
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
	.setName('audit')
	.setDescription('Configure the audit channel for this server')
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('set')
		.setDescription('Set\'s the channel to post audits in')
		.addChannelOption((opt: SlashCommandChannelOption) => opt
			.setName('channel')
			.setDescription('Channel to set as the audits channel')
			.setRequired(true)))
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('get')
		.setDescription('Get\'s the channel audits are posted in'))
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('clear')
		.setDescription('Disables the audits channel feature'));

export const AuditCommand: SlashSubGroupCommand = {
	commandData: data,
	execute: exec
};