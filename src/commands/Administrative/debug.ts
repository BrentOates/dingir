import { ChannelType, Message } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { Command } from '../../types/Command';
import { ServerConfig } from '../../client/models/ServerConfig';

const run = async (
  client: NovaClient,
  message: Message,
  config: ServerConfig
): Promise<any> => {
  config.debug = !config.debug;

  await config.save();

  return message.channel.send({
    content: `Debug mode ${config.debug ? 'enabled' : 'disabled'} for ${
      message.guild.name
    }.`,
  });
};

const command: Command = {
  name: 'debug',
  title: 'Toggle Debug',
  description:
    'Toggles showing debug messages in this server when errors occur.',
  usage: 'debug',
  example: 'debug',
  admin: true,
  deleteCmd: false,
  limited: false,
  channels: [ChannelType.GuildText],
  run: run,
};

export = command;
