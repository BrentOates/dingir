import { SlashCommandSubcommandBuilder, SlashCommandChannelOption, ChatInputCommandInteraction, SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { ServerConfig } from '../../../client/models/ServerConfig';
import { SlashSubGroupCommand } from '../../../types/SlashCommand';
import { BirthdayManager } from '../../../utilities/BirthdayManager';

const create = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	const { id } = cmd.options.getChannel('channel');
	const channel = cmd.guild.channels.cache.get(id);

	if (!channel || !channel.isTextBased()) {
		return cmd.reply('Provided channel is not a text channel');
	}

	const birthdaysCalendar = await channel.send({
		content: 'Placeholder calendar message - populating...'
	});
	config.birthdayCalendarMessagePath = `${birthdaysCalendar.channel.id}/${birthdaysCalendar.id}`;
	await config.save();
	await BirthdayManager.populateCalendars(cmd.client, cmd.guild.id);

	cmd.reply({ content: 'Birthday calendar has been created.', ephemeral: true });
};

const sync = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	try {
		await BirthdayManager.populateCalendars(cmd.client, config.serverId);
	} catch {
		return cmd.reply({
			content: 'An error ocurred running the calendar sync for this server.',
			ephemeral: true
		});
	}

	return cmd.reply({
		content: `Calendar successfully synchronised for ${cmd.guild.name}.`,
		ephemeral: true
	});
};

const exec = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	const subCommand = cmd.options.getSubcommand();
	if (subCommand == 'create') {
		return create(cmd, config);
	} else if (subCommand == 'sync') {
		return sync(cmd, config);
	} else {
		return cmd.reply({
			content: 'A valid option was not supplied for this command',
			ephemeral: true
		});
	}
};

const data = new SlashCommandSubcommandGroupBuilder()
	.setName('birthdays')
	.setDescription('Configure the birthday calendar for this server')
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('create')
		.setDescription('Creates or recreates a birthday calendar for this server')
		.addChannelOption((opt: SlashCommandChannelOption) => opt
			.setName('channel')
			.setDescription('Channel to create the birthday calendar in')
			.setRequired(true)))
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('sync')
		.setDescription('Syncs the birthday calendar for this server'));


export const BirthdaysConfigCommand: SlashSubGroupCommand = {
	commandData: data,
	execute: exec
};