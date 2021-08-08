import { DateTime } from 'luxon';
import { Command } from '../../types/Command';
import { BirthdayManager } from '../../utilities/BirthdayManager';
import { NovaClient } from '../../client/NovaClient';
import { Message } from 'discord.js';
import { ServerConfig } from '../../types/ServerConfig';
import { UserProfileService } from '../../utilities/UserProfileService';

const run = async (client: NovaClient, message: Message, config: ServerConfig, args: any[]): Promise<any> => {
	if(args.length < 1) {
		return message.channel.send(`Please provide your birthday in the format DD/MM ie. \`${config.prefix}mybirthday 30/12\` for 30th December`);
	}

	const date = args[0].split('/');
	const month = parseInt(date[1], 10);
	let day = parseInt(date[0], 10);
	let alteredForLeap = false;

	const now = DateTime.local();

	if(!now.isInLeapYear && day === 29 && month === 2)
	{
		day--;
		alteredForLeap = true;
	}

	let nextDate = DateTime.local(now.year, month, day);

	if (nextDate <= now){
		nextDate = nextDate.plus({year: 1});
		if (nextDate.isInLeapYear && alteredForLeap){
			nextDate = nextDate.plus({day: 1});
		}
	}
	
	if (!nextDate.isValid) {
		return message.channel.send('Looks like that date was invalid, make sure it is in the format of day/month');
	}

	const userProfile = await UserProfileService.getUserProfile(message.guild.id, message.author.id);
	if (!userProfile)
		return message.channel.send('There was a problem getting your user profile.');

	userProfile.birthdayDay = day;
	userProfile.birthdayMonth = month;

	const updatedProfile = await UserProfileService.updateUserProfile(userProfile);
	if (!updatedProfile)
		return message.channel.send('There was a problem updating your user profile.');

	message.channel.send(`I've set your next birthday to ${nextDate.toLocaleString(DateTime.DATE_FULL)}!`);
	BirthdayManager.populateCalendars(client, message.guild.id);
};

const command: Command = {
	name: 'mybirthday',
	title: 'My Birthday',
	description: 'Sets your Birthday day & month for birthday notifications!',
	usage: 'mybirthday DD/MM',
	example: 'mybirthday 18/09',
	admin: false,
	deleteCmd: false,
	limited: false,
	channels: ['GUILD_TEXT'],
	run: run
};

export = command;