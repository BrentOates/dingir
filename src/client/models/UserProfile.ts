import { Table, Column, Model, Default } from 'sequelize-typescript';

@Table
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class UserProfile extends Model {
  @Column
  declare serverId: string;

  @Column
  declare userId: string;

  @Column
  declare birthdayYear: number;

  @Column
  declare birthdayMonth: number;

  @Column
  declare birthdayDay: number;

  @Default(0)
  @Column
  declare activityScore: number;
}
