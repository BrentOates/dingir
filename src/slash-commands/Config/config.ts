import { ChannelType } from 'discord.js';
import { defineCommand } from '../../framework/command';
import { booleanSetting, channelSetting } from '../../framework/settings';
import BirthdaysGroup from './Subcommands/birthdays';
import DebugGroup from './Subcommands/debug';
import NewRolesGroup from './Subcommands/newroles';
import WelcomeGroup from './Subcommands/welcome';

const textChannels = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

export default defineCommand({
  name: 'config',
  description: 'Manage configuration data for this server',
  adminOnly: true,
  groups: [
    channelSetting({
      name: 'announcements',
      description: 'Configure the announcements channel for this server',
      field: 'announcementsChannelId',
      label: 'Announcements channel',
      channelTypes: [...textChannels],
    }),
    DebugGroup,
    booleanSetting({
      name: 'sysmsgs',
      description: "Toggle bot-created welcome messages in the server's system channel",
      field: 'systemMessagesEnabled',
      label: 'Bot system messages',
    }),
    channelSetting({
      name: 'audit',
      description: 'Configure the audit channel for this server',
      field: 'auditChannelId',
      label: 'Audit channel',
      channelTypes: [...textChannels],
    }),
    WelcomeGroup,
    NewRolesGroup,
    BirthdaysGroup,
    channelSetting({
      name: 'honeypot',
      description: 'Configure the honey-pot channel for this server',
      field: 'honeyPotChannelId',
      label: 'Honey-pot channel',
      channelTypes: [...textChannels],
    }),
  ],
});
