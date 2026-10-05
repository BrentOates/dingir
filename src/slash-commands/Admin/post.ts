import { Attachment } from 'discord.js';
import { ServerConfig } from '../../client/models/ServerConfig';
import { CommandContext, defineCommand } from '../../framework/command';
import { EmbedColours } from '../../resources/EmbedColours';
import { EmbedCompatLayer } from '../../types/EmbedCompatLayer';
import { ChannelService } from '../../utilities/ChannelService';
import { Logger } from '../../utilities/Logger';

const sendAudit = async (
  ctx: CommandContext,
  config: ServerConfig,
  file: Attachment | null,
  content: string | null
) => {
  const embed = new EmbedCompatLayer();
  const member = ctx.guild.members.cache.get(ctx.interaction.user.id);

  embed
    .setColor(EmbedColours.neutral)
    .setAuthor({
      name: member?.displayName ?? ctx.interaction.user.username,
      iconURL: (member ?? ctx.interaction.user).displayAvatarURL(),
    })
    .addField('Content', content ? content : 'No')
    .addField('Attachment', file ? 'Yes' : 'No')
    .setDescription('Post created via Dingir')
    .setTimestamp();

  await ChannelService.sendAuditMessage(ctx.interaction.client, config, embed, file ?? undefined);
};

export default defineCommand({
  name: 'post',
  description: 'Posts a simple message and/or attachment to the given channel',
  adminOnly: true,
  defer: 'ephemeral',
  options: (b) =>
    b
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('Channel to post in').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('content').setDescription('Optional simple message to send')
      )
      .addAttachmentOption((opt) =>
        opt.setName('attachment').setDescription('Optional attachment to send')
      ),
  run: async (ctx) => {
    const cmd = ctx.interaction;
    const channel = cmd.options.getChannel('channel', true);
    const content = cmd.options.getString('content');
    const attachment = cmd.options.getAttachment('attachment');

    if (!content && !attachment) {
      await ctx.reply('You must provide at least text or an attachment');
      return;
    }

    const guildChannel = ctx.guild.channels.cache.get(channel.id);
    if (!guildChannel || !guildChannel.isTextBased()) {
      await ctx.reply('The provided channel is not valid');
      return;
    }

    await guildChannel
      .send({
        content: content ?? undefined,
        files: attachment ? [attachment] : undefined,
      })
      .catch(() => ctx.reply('An error was encountered sending this message'));

    await sendAudit(ctx, ctx.config, attachment, content).catch((err: unknown) =>
      Logger.writeError('Could not send post audit.', err)
    );

    await ctx.reply('Message successfully sent');
  },
});
