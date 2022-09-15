import { ChannelType, Message } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { EmbedColours } from '../../resources/EmbedColours';
import { Command } from '../../types/Command';
import { ServerConfig } from '../../client/models/ServerConfig';
import { ChannelService } from '../../utilities/ChannelService';
import { EmbedCompatLayer } from '../../types/EmbedCompatLayer';

const run = async (
  client: NovaClient,
  message: Message,
  config: ServerConfig,
  args: any[]
): Promise<any> => {
  if (args.length === 0) {
    if (!config.guestRoleIds) {
      return message.channel.send('No guest roles set');
    }

    const currentGuestRoles = [];
    const guildRoles = await message.guild.roles.fetch();
    const guestRoleIds = config.guestRoleIds.split(',');

    guestRoleIds.forEach((roleId) => {
      const guestRole = guildRoles.get(roleId);
      currentGuestRoles.push(guestRole ? guestRole.toString() : 'Unknown');
    });

    const embed = new EmbedCompatLayer()
      .setColor(EmbedColours.info)
      .setTitle('Current Guest Roles')
      .setDescription(currentGuestRoles.join('\n'))
      .setTimestamp();

    return message.channel.send({
      embeds: [embed],
    });
  }

  const newRoleIds = message.mentions.roles.map((role) => role.id);

  if (args[0] === 'unset') {
    config.guestRoleIds = null;
  } else if (!newRoleIds) {
    return message.channel.send(
      'Roles not found, make sure you tagged it correctly.'
    );
  } else {
    config.guestRoleIds = newRoleIds.join(',');
  }

  await config.save();

  const audit = new EmbedCompatLayer()
    .setColor(EmbedColours.info)
    .setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(
      `Guest roles ${!config.guestRoleIds ? 'Removed' : 'Updated'}`
    )
    .setTimestamp();

  if (!config.guestRoleIds) {
    audit.addField('New Guest Roles', 'Not set');
  } else {
    audit.addField(
      'New Guest Roles',
      message.mentions.roles.map((role) => role.toString()).join('\n')
    );
  }

  await ChannelService.sendAuditMessage(client, config, audit);

  if (config.guestRoleIds) {
    return message.channel.send('Guest User role(s) updated.');
  } else {
    return message.channel.send('Guest User role removed.');
  }
};

const command: Command = {
  name: 'setguest',
  title: 'Set the guest roles',
  description:
    'Sets the roles a user is given on accepting the rules for this server.',
  usage: 'setguest <role mentions>',
  example: 'setguest @somerole1 @somerole2',
  admin: true,
  deleteCmd: false,
  limited: false,
  channels: [ChannelType.GuildText],
  run: run,
};

export = command;
