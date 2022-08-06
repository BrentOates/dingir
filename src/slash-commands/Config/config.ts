import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { SlashCommand } from "../../types/SlashCommand";
import * as announcements from "./Subcommands/announcements"

const execute = async () => {
    
}

const commandData = new SlashCommandBuilder()
    .setName('config')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.setDMPermission(false)
    .addSubcommandGroup(announcements.data)
    .addSubcommandGroup(announcements.data);

const slashCommand: SlashCommand = {
    commandData: commandData,
    execute: execute
} 
export = slashCommand;