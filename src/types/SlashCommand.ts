import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    SlashCommandSubcommandBuilder, 
    SlashCommandSubcommandGroupBuilder, 
    SlashCommandSubcommandsOnlyBuilder} from 'npm:discord.js';
import { ServerConfig } from '../client/models/ServerConfig.ts';

export interface SlashCommand {
	commandData: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
    execute(interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<boolean>
}

export interface SlashSubGroupCommand {
    commandData: SlashCommandSubcommandGroupBuilder;
    execute(interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<boolean>
}

export interface SlashSubCommand {
    commandData: SlashCommandSubcommandBuilder;
    execute(interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<boolean>
}