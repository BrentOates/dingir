import { ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder, SlashCommandNumberOption } from 'discord.js';
import { DateTime } from 'luxon';
import { SlashCommand } from '../../types/SlashCommand';
import { BirthdayManager } from '../../utilities/BirthdayManager';
import { UserProfileService } from '../../utilities/UserProfileService';

const execute = async (cmd: ChatInputCommandInteraction) => {
	let day = cmd.options.getNumber('day');
	const month = cmd.options.getNumber('month');

	let alteredForLeap = false;

	const now = DateTime.local();

	if (!now.isInLeapYear && day === 29 && month === 2) {
		day--;
		alteredForLeap = true;
	}

	let nextDate = DateTime.local(now.year, month, day);

	if (nextDate <= now) {
		nextDate = nextDate.plus({
			year: 1,
		});
		if (nextDate.isInLeapYear && alteredForLeap) {
			nextDate = nextDate.plus({
				day: 1,
			});
		}
	}

	if (!nextDate.isValid) {
		return cmd.reply({
			content: 'It looks like that date was invalid, make sure a valid day and month were given',
			ephemeral: true
		});
	}

	const userProfile = await UserProfileService.getUserProfile(
		cmd.guild.id,
		cmd.user.id
	);

	userProfile.birthdayDay = day;
	userProfile.birthdayMonth = month;

	await userProfile.save();

	cmd.reply({
		content: `I've set your next birthday to ${nextDate.toLocaleString(DateTime.DATE_FULL)}!`,
		ephemeral: true
	});
	return BirthdayManager.populateCalendars(cmd.client, cmd.guild.id);
};

const commandData = new SlashCommandBuilder()
	.setName('mybirthday')
	.setDescription('Set your birthday in this server')
	.addNumberOption((opt: SlashCommandNumberOption) => opt
		.setName('day')
		.setDescription('Day of the month of your birthday')
		.setRequired(true)
		.setMinValue(1)
		.setMaxValue(31))
	.addNumberOption((opt: SlashCommandNumberOption) => opt
		.setName('month')
		.setDescription('Month of your birthday')
		.setRequired(true)
		.setMinValue(1)
		.setMaxValue(12))
	.setContexts([InteractionContextType.Guild]);

const slashCommand: SlashCommand = {
	commandData: commandData,
	execute: execute
};
export = slashCommand;