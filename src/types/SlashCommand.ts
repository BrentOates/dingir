import { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import { ServerConfig } from '../client/models/ServerConfig';

export interface SlashCommand {
	commandData: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
    execute(interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<any>
}