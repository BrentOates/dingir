import { Table, Column, DataType, Model, PrimaryKey, Default } from 'sequelize-typescript';

@Table
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

  @Column(DataType.STRING)
  declare guestRoleIds: string | null;

  @Column
  declare adminRoleId: string;

  @Column(DataType.STRING)
  declare welcomeMessage: string | null;

  @Default(false)
  @Column
  declare debug: boolean;

  @Column(DataType.STRING)
  declare auditChannelId: string | null;

  @Column(DataType.STRING)
  declare welcomeMessageBackgroundUrl: string | null;

  @Default(false)
  @Column
  declare systemMessagesEnabled: boolean;

  @Column(DataType.STRING)
  declare announcementsChannelId: string | null;

  @Column(DataType.STRING)
  declare birthdayCalendarMessagePath: string | null;

  @Column(DataType.STRING)
  declare honeyPotChannelId: string | null;
}
