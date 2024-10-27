import { ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { SlashCommand } from '../../types/SlashCommand';

const execute = async (cmd: ChatInputCommandInteraction) => {
	return cmd.reply({
		content: 'Pong!',
		ephemeral: true
	});
};

const commandData = new SlashCommandBuilder()
	.setName('ping')
	.setDescription('Pings Dingir')
	.setContexts([InteractionContextType.Guild]);

const slashCommand: SlashCommand = {
	commandData: commandData,
	execute: execute
};
export = slashCommand;