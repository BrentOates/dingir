import { NovaClient } from '../client/NovaClient';
import { Client, Guild, GuildMember, TextChannel } from 'npm:discord.js';
import { DateTime } from 'npm:luxon';
import _ from 'npm:underscore';
import { ConfigService } from './ConfigService';
import { UserProfileService } from './UserProfileService';
import { Logger } from './Logger';
import { ServerConfig } from '../client/models/ServerConfig';
import { UserProfile } from '../client/models/UserProfile';
import { UserBirthday } from '../types/UserBirthday.ts';

export class BirthdayManager {
	public static async populateCalendars (client: Client, serverId?: string): Promise<void> {
		Logger.writeLog('Running birthday calendar update job.');

    let parsedConfigs: ServerConfig[] = [];

    if (serverId) {
      const serverConfig: ServerConfig = await ConfigService.getConfig(serverId).catch(
        (err: unknown) => {
          return Logger.writeError(
            'Error fetching server config for single run.',
            err
          );
        }
      );
      if (serverConfig) {
        parsedConfigs = [serverConfig];
      }
    } else {
      const serverConfigs = await ConfigService.getConfigs().catch((err: unknown) => {
        return Logger.writeError(
          'Error fetching server configs for bulk run.',
          err
        );
      });
      if (serverConfigs) {
        parsedConfigs = serverConfigs;
      }
    }

    if (parsedConfigs.length < 1) {
      return Logger.writeLog(
        'No server configs to run birthday calendar population for.'
      );
    }

    parsedConfigs = parsedConfigs.filter(
      (config) => config.birthdayCalendarMessagePath
    );

    for (const config of parsedConfigs) {
      const profiles = await UserProfileService.getServerBirthdays(
        config.serverId
      );
      const [channelId, messageId] =
        config.birthdayCalendarMessagePath.split('/');
      let messageContent = ':tada: ~ Upcoming Birthdays ~ :tada:\n';

      const chanToEdit = await client.channels.fetch(channelId);
      if (!chanToEdit || !chanToEdit.isTextBased()) {
        Logger.writeError(
          `Could not find birthday channel for server ${config.serverId}`
        );
      }

      const birthdayMessage = await (chanToEdit as TextChannel).messages.fetch(
        messageId
      );
      if (!birthdayMessage) {
        Logger.writeError(
          `Could not find birthday message for server ${config.serverId}`
        );
      }

      if (profiles.length < 1) {
        messageContent += '-------------';
        messageContent += 'There are no birthdays in this server, set yours with `/mybirthday`';
      } else {
        const mapped = profiles.map((u: UserProfile) => {
          let alteredForLeap = false;

          const now = DateTime.local();

          if (
            !now.isInLeapYear &&
            u.birthdayDay === 29 &&
            u.birthdayMonth === 2
          ) {
            u.birthdayDay--;
            alteredForLeap = true;
          }

          let nextDate = DateTime.local(
            now.year,
            u.birthdayMonth,
            u.birthdayDay
          );  

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

          return {
            userId: u.userId,
            birthday: nextDate,
          };
        });

        const sorted = _.sortBy(mapped, (o: UserBirthday) => o.birthday).slice(0, 10);
        const groupedSort = _.groupBy(sorted, 'birthday');

        messageContent += "Here's the next 10 birthdays in this guild!\n";
        messageContent += 'Add your birthday using `/mybirthday`\n';
        messageContent += '-------------';

        for (const group in groupedSort) {
          const date = groupedSort[group][0].birthday.toLocaleString(
            DateTime.DATE_FULL
          );
          let members = '';

          groupedSort[group].forEach((m) => {
            members += `<@${m.userId}>\n`;
          });
          messageContent += `\n**${date}**\n${members}`;
          messageContent += '-------------';
        }
      }

      await birthdayMessage.edit({
        content: messageContent,
        allowedMentions: {
          users: [],
        },
      });
    }

    Logger.writeLog('Finished birthday calendar update job.');
  }

  public static async notifyServerBirthdays(client: NovaClient, profiles: UserProfile[], config: ServerConfig) {
    if (config && config.announcementsChannelId) {
      const server: Guild = client.guilds.cache.get(config.serverId);
      if (!server) {
        return Logger.writeError(`Server missing with id ${config.serverId}`);
      }
    
      const announcementsChannel = server.channels.cache.get(config.announcementsChannelId);
      if (!announcementsChannel) {
        return Logger.writeError(`Announcements Channel missing for: ${server.toString()}`);
      }

      if (!announcementsChannel.isTextBased()) {
        return Logger.writeError(`Channel not text based for ${server.toString()}`);
      }

      let tags = '';

      for (const user of profiles) {
        const member: GuildMember = await server.members.fetch(user.userId);
        if (member) {
          tags += `${member.toString()}, `;
        }
      }

      if (tags) {
        tags = tags.replace(/,\s*$/, '');
        const msg = `Happy Birthday to ${tags}!`;
        announcementsChannel.send(msg).catch((err) => {
          return Logger.writeError('Error sending Birthday message', err);
        });
      }
    }
  }

  public static async notifyBirthdays(client: NovaClient): Promise<void> {
    Logger.writeLog('Running birthday notifications job.');

    const profiles = await UserProfileService.getBirthdaysToday();
    const usersWithBirthdaysByServer = _.groupBy(profiles, 'serverId');

    for (const server in usersWithBirthdaysByServer) {
      const config = await ConfigService.getConfig(server);
      this.notifyServerBirthdays(client, usersWithBirthdaysByServer[server], config);
    }

    Logger.writeLog('Finished birthday notifications job.');
  }
}
