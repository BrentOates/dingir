import { GuildMember, AttachmentBuilder } from 'discord.js';
import { NovaClient } from '../client/NovaClient';
import { RunFunction } from '../types/Event';
import { EmbedColours } from '../resources/EmbedColours';
import { ChannelService } from '../utilities/ChannelService';
import { ConfigService } from '../utilities/ConfigService';
import { DateTime } from 'luxon';
import { ServerConfig } from '../client/models/ServerConfig';
import { Logger } from '../utilities/Logger';
import { EmbedCompatLayer } from '../types/EmbedCompatLayer';
import { Canvas, createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';

const applyText = (canvas: Canvas, text: string, baseSize: number) => {
  const ctx = canvas.getContext('2d');

  let fontSize = baseSize;

  do {
    fontSize--;
  } while (ctx.measureText(text).width > canvas.width - 300);

  ctx.font = `${fontSize}px Roboto`;

  return ctx.font;
};

const sendSystemMessage = async (config: ServerConfig, member: GuildMember) => {
  const welcomeMessage = config.welcomeMessage.replace(
    '{member}',
    `<@${member.id}>`
  );

  GlobalFonts.registerFromPath(
    `${__dirname}/../resources/fonts/Roboto-Regular.ttf`,
    'Roboto'
  );

  const canvas = createCanvas(700, 250);
  const ctx = canvas.getContext('2d');
  const joinedTs = DateTime.fromMillis(member.joinedTimestamp).toLocaleString(
    DateTime.DATE_FULL
  );

  // Draw background
  const background = await loadImage(config.welcomeMessageBackgroundUrl);
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

  // Draw Username
  ctx.font = applyText(canvas, member.user.tag, 48);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(member.user.tag, 225, 125);

  // Draw Server name
  ctx.font = applyText(canvas, `Welcome to ${member.guild.name}!`, 34);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Welcome to ${member.guild.name}!`, 225, 160);

  // Draw Joined at
  ctx.font = applyText(canvas, `Joined: ${joinedTs}`, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Joined: ${joinedTs}`, 225, 200);

  // Draw Avatar
  ctx.beginPath();
  ctx.arc(125, 125, 75, 0, Math.PI * 2, true);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.closePath();
  ctx.clip();

  const avatar = await loadImage(
    member.displayAvatarURL({
      extension: 'jpg',
    })
  );
  ctx.drawImage(avatar, 50, 50, 150, 150);

  const attachment = new AttachmentBuilder(await canvas.encode('png')).setName(
    'welcome-image.png'
  );

  await member.guild.systemChannel.send({
    content: welcomeMessage,
    files: [attachment],
  });
};

export const name = 'guildMemberUpdate';
export const run: RunFunction = async (
  client: NovaClient,
  oldMember: GuildMember,
  newMember: GuildMember
) => {
  if (newMember.partial) {
    await newMember.fetch();
  }

  const serverConfig = await ConfigService.getConfig(newMember.guild.id);
  const notPassedScreen =
    oldMember.pending ||
    (oldMember.pending === null && newMember.roles.cache.size === 1);

  if (notPassedScreen && !newMember.pending && serverConfig.guestRoleIds) {
    try {
      const audit = new EmbedCompatLayer()
        .setColor(EmbedColours.neutral)
        .setAuthor({
          name: newMember.user.tag,
          iconURL: newMember.displayAvatarURL(),
        })
        .setDescription('Rules accepted by member.')
        .addField('ID', newMember.user.id)
        .setTimestamp();

      await ChannelService.sendAuditMessage(client, serverConfig, audit);
    } catch (e) {
      return Logger.writeError(
        `Sending audit failed in guildMemberUpdate for server: ${serverConfig.id}.`,
        e
      );
    }

    try {
      const guestRoleIds = serverConfig.guestRoleIds.split(',');
      const guildRoles = await newMember.guild.roles.fetch();

      await newMember.roles.add(
        guildRoles.filter((role) => guestRoleIds.includes(role.id))
      );
    } catch (e) {
      Logger.writeError(
        `Adding guest roles failed in guildMemberUpdate for server: ${serverConfig.id}.`,
        e
      );
      const audit = new EmbedCompatLayer()
        .setColor(EmbedColours.negative)
        .setAuthor({
          name: newMember.user.tag,
          iconURL: newMember.displayAvatarURL(),
        })
        .setDescription('Unable to provide guest role(s) to user.')
        .addField('ID', newMember.user.id)
        .setTimestamp();

      return ChannelService.sendAuditMessage(client, serverConfig, audit);
    }

    if (
      serverConfig.welcomeMessage &&
      serverConfig.systemMessagesEnabled &&
      serverConfig.welcomeMessageBackgroundUrl
    ) {
      try {
        await sendSystemMessage(serverConfig, newMember);
      } catch (e) {
        Logger.writeError(
          `Sending welcome message failed in guildMemberUpdate for server: ${serverConfig.id}.`,
          e
        );
        const audit = new EmbedCompatLayer()
          .setColor(EmbedColours.negative)
          .setAuthor({
            name: newMember.user.tag,
            iconURL: newMember.displayAvatarURL(),
          })
          .setDescription('Unable to send welcome message.')
          .addField('ID', newMember.user.id)
          .setTimestamp();
        return ChannelService.sendAuditMessage(client, serverConfig, audit);
      }
    }
  }
};
