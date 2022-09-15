import { ChannelType, Message } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { Command } from '../../types/Command';
import { ServerConfig } from '../../client/models/ServerConfig';

const run = async (
  client: NovaClient,
  message: Message,
  config: ServerConfig
): Promise<any> => {
  config.systemMessagesEnabled = !config.systemMessagesEnabled;

  await config.save();

  return message.channel.send({
    content: `System messages ${
      config.systemMessagesEnabled ? 'Enabled' : 'Disabled'
    } for ${message.guild.name}.`,
  });
};

const command: Command = {
  name: 'sysmsgs',
  title: 'Toggle System Messages',
  description:
    'Toggles sending notifications of user events to the System Messages channel.',
  usage: 'sysmsgs',
  example: 'sysmsgs',
  admin: true,
  deleteCmd: false,
  limited: false,
  channels: [ChannelType.GuildText],
  run: run,
};

export = command;
