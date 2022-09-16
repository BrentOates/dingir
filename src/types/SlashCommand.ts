import { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandGroupBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import { ServerConfig } from '../client/models/ServerConfig';

export interface SlashCommand {
	commandData: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandSubcommandGroupBuilder;
    execute(interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<any>
}

export interface SlashSubGroupCommand {
    commandData: SlashCommandSubcommandGroupBuilder;
    execute(interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<any>
}

export interface SlashSubCommand {
    commandData: SlashCommandSubcommandsOnlyBuilder;
    execute(interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<any>
}