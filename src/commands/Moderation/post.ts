import { ChannelType, Message, PermissionFlagsBits } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { Command } from '../../types/Command';
import { ServerConfig } from '../../client/models/ServerConfig';

const run = async (
  client: NovaClient,
  message: Message,
  config: ServerConfig,
  args: any[]
): Promise<any> => {
  const channel = message.mentions.channels.first();

  if (!channel) {
    return message.channel.send(
      'Channel not found, or I do not have permission to access it.'
    );
  }

  if (!channel.isTextBased() || channel.isDMBased()) {
    return message.channel.send('Channel must be a guild text channel.');
  }

  if (
    !channel
      .permissionsFor(client.user)
      .has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles])
  ) {
    return message.channel.send(
      `I do not have permission to send messages and attachments in ${channel.toString()}.`
    );
  }

  let messageContent = message.content
    .slice(config.prefix.length + command.name.length)
    .trim();
  messageContent = messageContent.slice(args[0].length).trim();

  const attachments = message.attachments;
  const files = [];

  attachments.forEach((a) => {
    files.push(a.url);
  });

  channel.send({
    content: messageContent,
    files: files,
  });
};

const command: Command = {
  name: 'post',
  title: 'Post to channel',
  description:
    'Starts the wizard for adding a todo item to the list for this server.',
  usage: 'post <channel mention> <text>',
  example: 'post #general This is some example text.',
  admin: true,
  deleteCmd: false,
  limited: false,
  channels: [ChannelType.GuildText],
  run: run,
};

export = command;
