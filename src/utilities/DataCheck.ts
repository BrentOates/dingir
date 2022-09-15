import _ from 'underscore';
import { NovaClient } from '../client/NovaClient';
import { ConfigService } from './ConfigService';
import { Logger } from './Logger';
import { UserProfileService } from './UserProfileService';

export class DataCheck {
  public static async dataCleanup(client: NovaClient): Promise<void> {
    Logger.writeLog('Running data checkup job.');

    const servers = await ConfigService.getConfigs();
    const groupedSrvs = _.groupBy(servers, 'serverId');

    for (const srv in groupedSrvs) {
      const guild = await client.guilds.fetch(srv).catch(async (err) => {
        if (err.code === 50001) {
          Logger.writeLog(`No longer have access to guild: ${srv}.`);
          await ConfigService.deleteConfig(srv);
          await UserProfileService.deleteUsersByServer(srv);
        }
      });

      if (guild) {
        const users = await UserProfileService.getServerBirthdays(guild.id);
        const guildUsers = await guild.members.fetch();

        for (const u of users) {
          if (!guildUsers.find((gu) => gu.user.id === u.userId)) {
            await UserProfileService.deleteUser(u.serverId, u.userId);
          }
        }
      }
    }

    Logger.writeLog('Data checkup job complete.');
  }
}
