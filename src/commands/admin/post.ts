import type { Message } from 'discord.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { defineCommand } from '../../framework/command.ts';
import { UserError } from '../../framework/errors.ts';
import { EmbedColours } from '../../resources/EmbedColours.ts';
import { memberAuditEmbed } from '../../services/AuditEmbed.ts';
import { sendAudit } from '../../services/AuditService.ts';
import { resolveTextChannel } from '../../services/MemberResolver.ts';

export default defineCommand({
  name: 'post',
  description: 'Post a simple message and/or attachment to the given channel',
  adminOnly: true,
  defer: 'ephemeral',
  options: (b) =>
    b
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to post in')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('content').setDescription('Optional simple message to send').setMaxLength(2000),
      )
      .addAttachmentOption((opt) =>
        opt.setName('attachment').setDescription('Optional attachment to send'),
      ),
  run: async (ctx) => {
    const options = ctx.interaction.options;
    const target = options.getChannel('channel', true);
    const content = options.getString('content');
    const attachment = options.getAttachment('attachment');

    if (!content && !attachment) {
      throw new UserError('You must provide at least text or an attachment.');
    }

    const channel = await resolveTextChannel(ctx.guild, target.id);
    if (!channel) {
      throw new UserError('The provided channel is not valid.');
    }

    const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
    if (attachment) {
      required.push(PermissionFlagsBits.AttachFiles);
    }
    const botPermissions = channel.permissionsFor(ctx.guild.members.me ?? ctx.guild.client.user);
    const missing = required.filter((flag) => !botPermissions?.has(flag));
    if (missing.length > 0) {
      const names = Object.entries(PermissionFlagsBits)
        .filter(([, flag]) => missing.includes(flag))
        .map(([name]) => name);
      throw new UserError(
        `I am missing permissions in ${channel.toString()}: ${names.join(', ')}.`,
      );
    }

    let sent: Message;
    try {
      sent = await channel.send({
        content: content ?? undefined,
        files: attachment ? [attachment] : undefined,
        allowedMentions: { parse: ['users', 'roles'] },
      });
    } catch (error) {
      ctx.app.logger.warn(
        'Failed to send /post message',
        { guildId: ctx.guild.id, channelId: channel.id },
        error,
      );
      throw new UserError('An error was encountered sending this message.', { cause: error });
    }

    const audit = memberAuditEmbed(ctx.member, EmbedColours.neutral, 'Post created via Dingir')
      .addField('Channel', channel.toString())
      .addField('Content', content ?? 'No text')
      .addField('Attachment', attachment ? attachment.name : 'No')
      .addField('Message', sent.url);
    await sendAudit(ctx.app, ctx.interaction.client, ctx.config, audit);

    await ctx.reply(`Posted in ${channel.toString()}: ${sent.url}`);
  },
});
