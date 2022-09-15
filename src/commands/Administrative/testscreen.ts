import { ChannelType, Message } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { Command } from '../../types/Command';

const run = async (client: NovaClient, message: Message): Promise<any> => {
  const oldMemberMock = Object.assign({},
    message.mentions.members.first() ?? message.member,
    {
      pending: true,
    }
  );
  const newMemberMock = message.mentions.members.first() ?? message.member;

  client.emit('guildMemberUpdate', oldMemberMock, newMemberMock);
};

const command: Command = {
  name: 'testscreen',
  title: 'Trigger a user screening event',
  description:
    'Fires the event for guildMemberUpdate as mentioned user, or the current user if not provided.',
  usage: 'testscreen',
  example: 'testscreen',
  admin: true,
  deleteCmd: false,
  limited: false,
  channels: [ChannelType.GuildText],
  run: run,
};

export = command;
