import { ChannelType, Message } from 'discord.js';
import { DateTime } from 'luxon';
import { NovaClient } from '../../client/NovaClient';
import { Command } from '../../types/Command';
import { ServerConfig } from '../../client/models/ServerConfig';

const run = async (
  client: NovaClient,
  message: Message,
  config: ServerConfig,
  args: any[]
): Promise<any> => {
  if (args.length < 2) {
    return message.channel.send(
      `Please provide the required arguments: \`${config.prefix}${command.usage}\``
    );
  }

  const days = args[0];
  const role = message.mentions.roles.first();

  if (!role) {
    return message.channel.send(
      'Unable to find that role, or a role was not provided.'
    );
  }

  const allMembers = await message.guild.members.fetch();

  const members = allMembers.filter((member) => {
    const joined = DateTime.fromMillis(member.joinedTimestamp).startOf('day');
    const daysInServer = DateTime.local()
      .startOf('day')
      .diff(joined, 'days')
      .toObject().days;
    return (
      member.roles.cache.find((r) => r.id === role.id) &&
      daysInServer >= (days ?? 0)
    );
  });

  let response: string;

  if (members.size < 1) {
    response = `There are no users in ${role.toString()} that have been in the server for at least ${
      days ?? 0
    } days.`;
  } else {
    response = `**Users in ${role.toString()} that have been in the server for at least ${
      days ?? 0
    } days.**\n------\n`;
    members.each(async (mem) => {
      if (mem.partial) {
        await mem.fetch();
      }
      response += `${mem.toString()} joined <t:${Math.floor(
        mem.joinedTimestamp / 1000
      )}:R>\n`;
    });
  }

  return message.channel.send({
    content: response,
    allowedMentions: {
      parse: [],
    },
  });
};

const command: Command = {
  name: 'rolesince',
  title: 'Users in a role and time on the server',
  description:
    'Displays how long users with a given role have been in the server after a minimum threshold.',
  usage: 'rolesince <number of days> <role mention>',
  example: 'rolesince 7 @somerole',
  admin: true,
  deleteCmd: false,
  limited: false,
  channels: [ChannelType.GuildText],
  run: run,
};

export = command;
