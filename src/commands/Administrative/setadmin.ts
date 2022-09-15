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
  if (config.adminRoleId) {
    if (!message.member.roles.cache.has(config.adminRoleId)) {
      return message.channel.send({
        content: 'You do not have the required permissions for this command.',
      });
    }
  }

  const newRole = message.mentions.roles.first();
  if (args.length === 0 && config.adminRoleId) {
    config.adminRoleId = null;
  } else if (args.length === 0 && !config.adminRoleId) {
    return message.channel.send({
      content: 'Please tag a role to set as admin.',
    });
  } else if (!newRole) {
    return message.channel.send({
      content: 'Role not found, make sure you tagged it correctly.',
    });
  } else {
    config.adminRoleId = newRole.id;
  }

  await config.save();
  if (config.adminRoleId) {
    return message.channel.send({
      content: `Admin role updated to ${newRole.name} for ${message.guild.name}.`,
    });
  } else {
    return message.channel.send({
      content: `Admin role removed for ${message.guild.name}.`,
    });
  }
};

const command: Command = {
  name: 'setadmin',
  title: 'Set the admin role',
  description:
    'Sets the role used for checking if a user can execute admin commands.',
  usage: 'setadmin <role mention>',
  example: 'setadmin @somerole',
  admin: false,
  deleteCmd: false,
  limited: true,
  limitation:
    'Can be used by anyone when there is no admin role set for setup purposes.',
  channels: [ChannelType.GuildText],
  run: run,
};

export = command;
