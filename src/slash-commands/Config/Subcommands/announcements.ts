import { SlashCommandSubcommandGroupBuilder, SlashCommandSubcommandBuilder, SlashCommandChannelOption, ChatInputCommandInteraction } from 'discord.js';
import { ServerConfig } from '../../../client/models/ServerConfig';
import { SlashSubGroupCommand } from '../../../types/SlashCommand';
import { ConfigManager } from '../../../utilities/ConfigManager';

const set = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
    ConfigManager.updateChannelNew(cmd, config, 'announcementsChannelId');
	return get(cmd, config);
};

const get = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	const channel = await ConfigManager.getChannel(cmd, config, 'announcementsChannelId');
	return cmd.reply({
		content: `The announcements channel for this server is: ${channel ? channel.toString() : 'Not Set'}`,
		ephemeral: true 
	});
};

const clear = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	ConfigManager.clearChannel(config, 'announcementsChannelId');
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
		return cmd.reply({
			content: 'A valid option was not supplied for this command',
			ephemeral: true
		});
	}
};

const data = new SlashCommandSubcommandGroupBuilder()
	.setName('announcements')
	.setDescription('Configure the announcements channel for this server')
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('set')
		.setDescription('Set\'s the channel to post announcements in')
		.addChannelOption((opt: SlashCommandChannelOption) => opt
			.setName('channel')
			.setDescription('Channel to set as the announcements channel')
			.setRequired(true)))
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('get')
		.setDescription('Get\'s the channel announcements are posted in'))
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('clear')
		.setDescription('Disables the announcements channel feature'));

export const AnnouncementsCommand: SlashSubGroupCommand = {
	commandData: data,
	execute: exec
};