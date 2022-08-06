import { Client, TextChannel } from 'discord.js';
import { DateTime } from 'luxon';
import _ from 'underscore';
import { ConfigService } from './ConfigService';
import { UserProfileService } from './UserProfileService';
import { Logger } from './Logger';
import { ServerConfig } from '../client/models/ServerConfig';

export class BirthdayManager {
	public static async populateCalendars (client: Client, serverId?: string): Promise<void> {
		Logger.writeLog('Running birthday calendar update job.');

		let parsedConfigs: ServerConfig[];

		if (serverId) {
			const serverConfig = await ConfigService.getConfig(serverId)
				.catch((err) => {
					return Logger.writeError('Error fetching server config for single run.', err);
				});
			if (serverConfig) {
				parsedConfigs = [serverConfig];
			}
		} else {
			const serverConfigs = await ConfigService.getConfigs()
				.catch((err) => {
					return Logger.writeError('Error fetching server configs for bulk run.', err);
				});
			if (serverConfigs) {
				parsedConfigs = serverConfigs;
			}
		}

		if (parsedConfigs.length < 1) {
			return Logger.writeLog('No server configs to run birthday calendar population for.');
		}

		parsedConfigs = parsedConfigs.filter(config => config.birthdayCalendarMessagePath);

		for (const config of parsedConfigs) {
			const profiles = await UserProfileService.getServerBirthdays(config.serverId);
			const [channelId, messageId] = config.birthdayCalendarMessagePath.split('/');
			let messageContent = (':tada: ~ Upcoming Birthdays ~ :tada:\n');

			const chanToEdit = await client.channels.fetch(channelId);
			if (!chanToEdit) {
				Logger.writeError(`Could not find birthday channel for server ${config.serverId}`);
			}

			const birthdayMessage = await (chanToEdit as TextChannel).messages.fetch(messageId);
			if (!birthdayMessage) {
				Logger.writeError(`Could not find birthday message for server ${config.serverId}`);
			}

			if (profiles.length < 1) {
				messageContent += ('-------------');
				messageContent += (`There are no birthdays in this server, set yours with \`${config.prefix}mybirthday\``);
			} else {
				const mapped = profiles.map(u => {
					let alteredForLeap = false;

					const now = DateTime.local();

					if (!now.isInLeapYear && u.birthdayDay === 29 && u.birthdayMonth === 2) {
						u.birthdayDay--;
						alteredForLeap = true;
					}

					let nextDate = DateTime.local(now.year, u.birthdayMonth, u.birthdayDay);

					if (nextDate <= now) {
						nextDate = nextDate.plus({
							year: 1
						});
						if (nextDate.isInLeapYear && alteredForLeap) {
							nextDate = nextDate.plus({
								day: 1
							});
						}
					}

					return {
						userId: u.userId, birthday: nextDate
					};
				});

				const sorted = _.sortBy(mapped, (o) => o.birthday).slice(0, 10);
				const groupedSort = _.groupBy(sorted, 'birthday');

				messageContent += ('Here\'s the next 10 birthdays in this guild!\n');
				messageContent += (`Add your birthday using \`${config.prefix}mybirthday\`\n`);
				messageContent += ('-------------');

				for (const group in groupedSort) {
					const date = groupedSort[group][0].birthday.toLocaleString(DateTime.DATE_FULL);
					let members = '';

					groupedSort[group].forEach(m => {
						members += `<@${m.userId}>\n`;
					});
					messageContent += (`\n**${date}**\n${members}`);
					messageContent += ('-------------');
				}
			}

			await birthdayMessage.edit({
				content: messageContent, allowedMentions: {
					'users' : []
				}
			});
		}

		Logger.writeLog('Finished birthday calendar update job.');
	}

	public static async notifyBirthdays(client: Client): Promise<void> {
		Logger.writeLog('Running birthday notifications job.');

		const profiles = await UserProfileService.getBirthdaysToday();
		const usersWithBirthdaysByServer = _.groupBy(profiles, 'serverId');

		for (const server in usersWithBirthdaysByServer) {

			const config = await ConfigService.getConfig(server);
			if (config && config.announcementsChannelId) {
				const srv = await client.guilds.fetch(server)
					.catch(err => {
						return Logger.writeError('Error getting server.', err);
					});
				const chan = await client.channels.fetch(config.announcementsChannelId)
					.catch(err => {
						return Logger.writeError('Error getting channel.', err);
					});
				if (!srv || !chan) {
					return Logger.writeError('Channel or Server object empty');
				}
				let tags = '';
				usersWithBirthdaysByServer[server].forEach(u => {
					if (srv.members.resolve(u.userId)) {
						tags += `<@${u.userId}>, `;
					}
				});
				if (tags) {
					tags = tags.replace(/,\s*$/, '');
					const msg = `Happy Birthday to ${tags}!`;
					(chan as TextChannel).send(msg)
						.catch(err => {
							return Logger.writeError('Error sending Birthday message', err);
						});
				}
			}
		}
		Logger.writeLog('Finished birthday notifications job.');
	}
}
