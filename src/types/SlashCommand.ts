import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    SlashCommandOptionsOnlyBuilder, 
    SlashCommandSubcommandBuilder, 
    SlashCommandSubcommandGroupBuilder, 
    SlashCommandSubcommandsOnlyBuilder} from 'discord.js';
import { ServerConfig } from '../client/models/ServerConfig';

export interface SlashCommand {
	commandData: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
    execute(interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<any>
}

export interface SlashSubGroupCommand {
    commandData: SlashCommandSubcommandGroupBuilder;
    execute(interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<any>
}

export interface SlashSubCommand {
    commandData: SlashCommandSubcommandBuilder;
    execute(interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<any>
}