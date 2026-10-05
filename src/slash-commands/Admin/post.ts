import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  SlashCommandChannelOption,
  SlashCommandStringOption,
  SlashCommandAttachmentOption,
  Attachment,
  InteractionContextType,
} from 'discord.js';
import { ServerConfig } from '../../client/models/ServerConfig';
import { EmbedColours } from '../../resources/EmbedColours';
import { EmbedCompatLayer } from '../../types/EmbedCompatLayer';
import { SlashCommand } from '../../types/SlashCommand';
import { ChannelService } from '../../utilities/ChannelService';
import { Logger } from '../../utilities/Logger';
import { requireGuild } from '../../utilities/requireGuild';

const sendAudit = async (
  cmd: ChatInputCommandInteraction,
  config: ServerConfig,
  file: Attachment | null,
  content: string | null
) => {
  const embed = new EmbedCompatLayer();
  const member = requireGuild(cmd).members.cache.get(cmd.user.id);

  embed
    .setColor(EmbedColours.neutral)
    .setAuthor({
      name: member?.displayName ?? cmd.user.username,
      iconURL: (member ?? cmd.user).displayAvatarURL(),
    })
    .addField('Content', content ? content : 'No')
    .addField('Attachment', file ? 'Yes' : 'No')
    .setDescription('Post created via Dingir')
    .setTimestamp();

  await ChannelService.sendAuditMessage(cmd.client, config, embed, file ?? undefined);
};

const execute = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
  await cmd.deferReply({ ephemeral: true });
  const channel = cmd.options.getChannel('channel', true);
  const content = cmd.options.getString('content');
  const attachment = cmd.options.getAttachment('attachment');

  if (!content && !attachment) {
    return cmd.editReply({
      content: 'You must provide at least text or an attachment',
    });
  }

  const guildChannel = requireGuild(cmd).channels.cache.get(channel.id);
  if (!guildChannel || !guildChannel.isTextBased()) {
    return cmd.editReply({
      content: 'The provided channel is not valid',
    });
  }

  await guildChannel
    .send({
      content: content ?? undefined,
      files: attachment ? [attachment] : undefined,
    })
    .catch(() => {
      return cmd.editReply({
        content: 'An error was encountered sending this message',
      });
    });

  await sendAudit(cmd, config, attachment, content).catch((err: unknown) =>
    Logger.writeError('Could not send post audit.', err)
  );

  return cmd.editReply({
    content: 'Message successfully sent',
  });
};

const commandData = new SlashCommandBuilder()
  .setName('post')
  .setDescription('Posts a simple message and/or attachment to the given channel')
  .addChannelOption((opt: SlashCommandChannelOption) =>
    opt.setName('channel').setDescription('Channel to post in').setRequired(true)
  )
  .addStringOption((opt: SlashCommandStringOption) =>
    opt.setName('content').setDescription('Optional simple message to send')
  )
  .addAttachmentOption((opt: SlashCommandAttachmentOption) =>
    opt.setName('attachment').setDescription('Optional attachment to send')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts([InteractionContextType.Guild]);

const slashCommand: SlashCommand = {
  commandData: commandData,
  execute: execute,
};
export = slashCommand;
