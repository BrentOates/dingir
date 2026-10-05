import { Op } from 'sequelize';
import { UserProfile } from '../client/models/UserProfile';

export class UserProfileService {
  public static async getServerBirthdays(serverId: string): Promise<UserProfile[]> {
    return UserProfile.findAll({
      where: {
        birthdayDay: {
          [Op.not]: null,
        },
        birthdayMonth: {
          [Op.not]: null,
        },
        serverId: serverId,
      },
    });
  }

  public static async getServerProfiles(serverId: string): Promise<UserProfile[]> {
    return UserProfile.findAll({ where: { serverId } });
  }

  public static async setBirthday(
    serverId: string,
    userId: string,
    month: number,
    day: number
  ): Promise<void> {
    const profile = await this.getUserProfile(serverId, userId);
    profile.birthdayMonth = month;
    profile.birthdayDay = day;
    await profile.save();
  }

  public static async clearBirthday(serverId: string, userId: string): Promise<boolean> {
    const profile = await this.findUserProfile(serverId, userId);
    if (!profile) {
      return false;
    }
    profile.birthdayYear = null;
    profile.birthdayMonth = null;
    profile.birthdayDay = null;
    await profile.save();
    return true;
  }

  public static async deleteUsers(serverId: string, userIds: string[]): Promise<number> {
    let removed = 0;
    for (let i = 0; i < userIds.length; i += 500) {
      removed += await UserProfile.destroy({
        where: { serverId, userId: { [Op.in]: userIds.slice(i, i + 500) } },
      });
    }
    return removed;
  }

  public static async getUserProfile(serverId: string, userId: string): Promise<UserProfile> {
    const [profiles] = await UserProfile.findOrCreate({
      where: {
        serverId: serverId,
        userId: userId,
      },
    });

    return profiles;
  }

  public static async findUserProfile(
    serverId: string,
    userId: string
  ): Promise<UserProfile | null> {
    return UserProfile.findOne({ where: { serverId, userId } });
  }

  public static async incrementActivityScore(serverId: string, userId: string): Promise<void> {
    await this.getUserProfile(serverId, userId);
    await UserProfile.increment({ activityScore: 1 }, { where: { serverId, userId } });
  }

  public static async deleteUser(serverId: string, userId: string): Promise<boolean> {
    const recordsDeleted = await UserProfile.destroy({
      where: {
        serverId: serverId,
        userId: userId,
      },
    });

    return recordsDeleted > 0;
  }

  public static async deleteUsersByServer(serverId: string): Promise<boolean> {
    const recordsDeleted = await UserProfile.destroy({
      where: {
        serverId: serverId,
      },
    });

    return recordsDeleted > 0;
  }
}
