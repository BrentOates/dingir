import { Table, Column, DataType, Model, Default } from 'sequelize-typescript';

@Table({
  indexes: [{ name: 'user_profiles_server_user_unique', unique: true, fields: ['serverId', 'userId'] }],
})
export class UserProfile extends Model {
  @Column
  declare serverId: string;

  @Column
  declare userId: string;

  @Column(DataType.INTEGER)
  declare birthdayYear: number | null;

  @Column(DataType.INTEGER)
  declare birthdayMonth: number | null;

  @Column(DataType.INTEGER)
  declare birthdayDay: number | null;

  @Default(0)
  @Column
  declare activityScore: number;
}
