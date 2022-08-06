import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { ServerConfig } from '../../client/models/ServerConfig';
import { BirthdayManager } from '../../utilities/BirthdayManager';

export const execute = async (interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<any> => {
	const birthdaysCalendar = await interaction.channel.send({
		content: 'Placeholder calendar message - populating...'
	});
	config.birthdayCalendarMessagePath = `${birthdaysCalendar.channel.id}/${birthdaysCalendar.id}`;
	await config.save();
	await BirthdayManager.populateCalendars(interaction.client, interaction.guild.id);
};

export const data = new SlashCommandBuilder()
	.setName('birthdaycal')
	.setDescription('Creates a birthday calendar for the server')
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.setDMPermission(false);
