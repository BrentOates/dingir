import { ChannelType, Message } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { Command } from '../../types/Command';
import { ServerConfig } from '../../client/models/ServerConfig';

const run = async (
  client: NovaClient,
  message: Message,
  config: ServerConfig,
  args: any[]
): Promise<any> => {
  config.prefix = ags[0];

  await config.save();

  return message.channel.send({
    content: `Prefix set to '${config.prefix}' for ${message.guild.name}.`,
  });
};

const command: Command = {
  name: 'prefix',
  title: 'Set server prefix',
  description: 'Sets the bot command prefix for this server.',
  usage: 'prefix <new prefix>',
  example: 'prefix ~',
  admin: true,
  deleteCmd: false,
  limited: false,
  channels: [ChannelType.GuildText],
  run: run,
};

export = command;
