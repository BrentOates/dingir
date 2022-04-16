import { Op } from 'sequelize';
import { UserProfile } from '../client/models/UserProfile';

export class UserProfileService {
	public static async getAllBirthdays (): Promise<UserProfile[]> {
		return await UserProfile.findAll({
			where: {
				birthdayDay: {
					[Op.not]: null
				},
				birthdayMonth: {
					[Op.not]: null
				}
			}
		});
	}

	public static async getServerBirthdays (serverId: string): Promise<UserProfile[]> {
		return await UserProfile.findAll({
			where: {
				birthdayDay: {
					[Op.not]: null
				},
				birthdayMonth: {
					[Op.not]: null
				},
				serverId: serverId
			}
		});
	}

	public static async getUserProfile (serverId: string, userId: string): Promise<UserProfile>{
		const [ profiles ] = await UserProfile.findOrCreate({
			where: {
				serverId: serverId,
				userId: userId
			}
		});
		
		return profiles;
	}

	public static async incrementActivityScore (serverId: string, userId: string): Promise<UserProfile> {
		await this.getUserProfile(serverId, userId);
		return await UserProfile.increment({ 
			activityScore: 1 
		}, {
			where: {
				serverId: serverId,
				userId: userId
			}
		});
	}

	public static async decrementActivityScore (serverId: string, userId: string): Promise<UserProfile> {
		await this.getUserProfile(serverId, userId);
		return await UserProfile.increment({ 
			activityScore: -1 
		}, {
			where: {
				serverId: serverId,
				userId: userId
			}
		});
	}

	public static async deleteUser (serverId: string, userId: string): Promise<boolean> {
		const recordsDeleted = await UserProfile.destroy({
			where: {
				serverId: serverId,
				userId: userId
			}
		});

		return recordsDeleted > 0;
	}

	public static async deleteUsersByServer (serverId: string): Promise<boolean> {
		const recordsDeleted = await UserProfile.destroy({
			where: {
				serverId: serverId
			}
		});

		return recordsDeleted > 0;
	}
}
