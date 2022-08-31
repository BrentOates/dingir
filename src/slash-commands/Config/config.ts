import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { ServerConfig } from '../../client/models/ServerConfig';
import { SlashCommand } from '../../types/SlashCommand';
import * as announcements from './Subcommands/announcements';

const execute = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	const subCommand = cmd.options.getSubcommandGroup();
    
};

const subCommands = async () => {
	const slashCommandFiles: string[] = await globPromise(
		`${__dirname}/**/*{.js,.ts}`
	);

	
}

const commandData = new SlashCommandBuilder()
	.setName('config')
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.setDMPermission(false)
	.addSubcommandGroup(announcements.data);

const slashCommand: SlashCommand = {
	commandData: commandData,
	execute: execute
}; 
export = slashCommand;

function globPromise(arg0: string): string[] | PromiseLike<string[]> {
	throw new Error('Function not implemented.');
}
