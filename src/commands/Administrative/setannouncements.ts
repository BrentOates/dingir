import { ChannelType, Message } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { Command } from '../../types/Command';
import { ServerConfig } from '../../client/models/ServerConfig';
import { ConfigManager } from '../../utilities/ConfigManager';

const run = async (
  client: NovaClient,
  message: Message,
  config: ServerConfig
): Promise<any> => {
  await ConfigManager.updateChannel(config, message, 'announcementsChannelId');
};

const command: Command = {
  name: 'setannouncements',
  title: 'Set the announcements channel',
  description: 'Sets the channel where the bot posts announcements.',
  usage: 'setannouncements <channel mention>',
  example: 'setannouncements #general',
  admin: true,
  deleteCmd: false,
  limited: false,
  channels: [ChannelType.GuildText],
  run: run,
};

export = command;
