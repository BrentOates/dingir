import {
  Table,
  Column,
  Model,
  PrimaryKey,
  Default,
} from 'sequelize-typescript';

@Table
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class ServerConfig extends Model {
  @PrimaryKey
  @Column
  declare serverId: string;

  @Default('^')
  @Column
  declare prefix: string;

  @Column
  declare rulesMessagePath: string;

  @Column
  declare rulesMessage: string;

  @Column
  declare guestRoleIds: string;

  @Column
  declare adminRoleId: string;

  @Column
  declare welcomeMessage: string;

  @Default(false)
  @Column
  declare debug: boolean;

  @Column
  declare auditChannelId: string;

  @Column
  declare welcomeMessageBackgroundUrl: string;

  @Default(false)
  @Column
  declare systemMessagesEnabled: boolean;

  @Column
  declare announcementsChannelId: string;

  @Column
  declare birthdayCalendarMessagePath: string;
}
