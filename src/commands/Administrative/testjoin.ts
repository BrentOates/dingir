import { ChannelType, Message } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { Command } from '../../types/Command';

const run = async (client: NovaClient, message: Message): Promise<any> => {
  client.emit(
    'guildMemberAdd',
    message.mentions.members.first() ?? message.member
  );
};

const command: Command = {
  name: 'testjoin',
  title: 'Trigger a user join event',
  description:
    'Fires the event for guildMemberAdd as mentioned user, or the current user if not provided.',
  usage: 'testjoin',
  example: 'testjoin',
  admin: true,
  deleteCmd: false,
  limited: false,
  channels: [ChannelType.GuildText],
  run: run,
};

export = command;
