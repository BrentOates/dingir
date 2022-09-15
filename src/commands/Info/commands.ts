import { Command } from '../../types/Command';
import { ChannelType, Message } from 'discord.js';
import { EmbedColours } from '../../resources/EmbedColours';
import { CommandAccess } from '../../utilities/CommandAccess';
import { NovaClient } from '../../client/NovaClient';
import { ServerConfig } from '../../client/models/ServerConfig';
import { EmbedCompatLayer } from '../../types/EmbedCompatLayer';

const run = async (
  client: NovaClient,
  message: Message,
  config: ServerConfig
): Promise<any> => {
  const embed = new EmbedCompatLayer()
    .setThumbnail(client.user.displayAvatarURL())
    .setTitle('Commands List')
    .setColor(EmbedColours.info)
    .setTimestamp();

  client.commands.forEach((cmd: Command) => {
    const commandAccess = new CommandAccess();
    const access = commandAccess.verifyAccess(cmd, message, config);
    if (access.hasAccess) {
      embed.addField(
        config ? config.prefix + cmd.usage : cmd.usage,
        cmd.description
      );
    }
  });

  return message.channel.send({
    embeds: [embed],
  });
};

const command: Command = {
  name: 'commands',
  title: 'Commands List',
  description: 'Shows a list of bot commands and help text.',
  usage: 'commands',
  example: 'commands',
  admin: false,
  deleteCmd: false,
  limited: false,
  channels: [ChannelType.GuildText, ChannelType.DM],
  run: run,
};

export = command;
