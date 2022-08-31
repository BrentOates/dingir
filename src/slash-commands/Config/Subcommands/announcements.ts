import { SlashCommandSubcommandGroupBuilder, SlashCommandSubcommandBuilder, SlashCommandChannelOption, ChatInputCommandInteraction } from 'discord.js';
import { ServerConfig } from '../../client/models/ServerConfig';

export const exec = async(cmd: ChatInputCommandInteraction, config: ServerConfig) => {
    const subCommand = cmd.options.getSubcommand();
    
}

export const set = async () => {
    
};

export const get = async () => {

};

export const clear = async () => {

};

export const data = new SlashCommandSubcommandGroupBuilder()
	.setName('announcements')
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