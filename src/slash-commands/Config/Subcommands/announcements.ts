import { SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder } from "discord.js"

export const set = async () => {

}

export const get = async () => {

}

export const clear = async () => {

}

export const data = new SlashCommandSubcommandGroupBuilder()
    .setName('announcements')
    .addSubcommand(sub => sub
        .setName('set')
        .setDescription('Set\'s the channel to post announcements in')
        .addChannelOption(opt => opt
            .setName('channel')
			.setDescription('Channel to set as the announcements channel')
			.setRequired(true)))
    .addSubcommand(sub => sub
        .setName('get')
        .setDescription('Get\'s the channel announcements are posted in'))
    .addSubcommand(sub => sub
        .setName('clear')
        .setDescription('Disables the announcements channel feature'))