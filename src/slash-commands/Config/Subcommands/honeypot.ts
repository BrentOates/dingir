import {
  ChannelType,
  ChatInputCommandInteraction,
  SlashCommandChannelOption,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
} from 'discord.js';
import { ServerConfig } from '../../../client/models/ServerConfig';
import { SlashSubGroupCommand } from '../../../types/SlashCommand';

const get = async (
  cmd: ChatInputCommandInteraction,
  config: ServerConfig
) => {
  const channel = config.honeyPotChannelId
    ? cmd.guild.channels.cache.get(config.honeyPotChannelId)
    : null;

  return cmd.reply({
    content: `The honey-pot channel for this server is: ${
      channel ? channel.toString() : 'Not Set'
    }`,
    ephemeral: true,
  });
};

const set = async (
  cmd: ChatInputCommandInteraction,
  config: ServerConfig
) => {
  const channel = cmd.options.getChannel('channel', true);
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    return cmd.reply({
      content: 'Honey-pot channels must be Text or Announcement Channels.',
      ephemeral: true,
    });
  }

  config.honeyPotChannelId = channel.id;
  await config.save();

  return cmd.reply({
    content: `Honey-pot channel updated to ${channel.toString()}.`,
    ephemeral: true,
  });
};

const clear = async (
  cmd: ChatInputCommandInteraction,
  config: ServerConfig
) => {
  config.honeyPotChannelId = null;
  await config.save();

  return cmd.reply({
    content: 'Honey-pot channel disabled.',
    ephemeral: true,
  });
};

const exec = async (
  cmd: ChatInputCommandInteraction,
  config: ServerConfig
) => {
  switch (cmd.options.getSubcommand()) {
    case 'set':
      return set(cmd, config);
    case 'get':
      return get(cmd, config);
    case 'clear':
      return clear(cmd, config);
    default:
      return cmd.reply({
        content: 'A valid option was not supplied for this command.',
        ephemeral: true,
      });
  }
};

const data = new SlashCommandSubcommandGroupBuilder()
  .setName('honeypot')
  .setDescription('Configure the honey-pot channel for this server')
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub
      .setName('set')
      .setDescription('Set the channel that automatically bans people who post in it')
      .addChannelOption((opt: SlashCommandChannelOption) =>
        opt
          .setName('channel')
          .setDescription('Channel to use as the honey-pot')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub
      .setName('get')
      .setDescription('Get the configured honey-pot channel')
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub
      .setName('clear')
      .setDescription('Disable the honey-pot channel')
  );

export const HoneyPotCommand: SlashSubGroupCommand = {
  commandData: data,
  execute: exec,
};
