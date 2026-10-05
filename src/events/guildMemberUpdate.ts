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
    ctx.font = `${fontSize}px Roboto`;
  } while (ctx.measureText(text).width > canvas.width - 300);

  return ctx.font;
};

const getWelcomeMessage = async (config: ServerConfig, member: GuildMember) => {
  return (config.welcomeMessage ?? '').replace('{member}', `<@${member.id}>`);
};

const getWelcomeImage = async (config: ServerConfig, member: GuildMember) => {
  GlobalFonts.registerFromPath(`${__dirname}/../resources/fonts/Roboto-Regular.ttf`, 'Roboto');

  const canvas = createCanvas(700, 250);
  const ctx = canvas.getContext('2d');
  if (member.joinedTimestamp === null) {
    throw new Error(`Join date unavailable for member ${member.id}.`);
  }
  const backgroundUrl = config.welcomeMessageBackgroundUrl;
  if (!backgroundUrl) {
    throw new Error('Welcome message background URL is not configured.');
  }
  const joinedTs = DateTime.fromMillis(member.joinedTimestamp).toLocaleString(DateTime.DATE_FULL);

  // Draw background
  const background = await loadImage(backgroundUrl);
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

  // Draw Username
  ctx.font = applyText(canvas, member.displayName, 48);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(member.displayName, 225, 125);

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

  const attachment = new AttachmentBuilder(await canvas.encode('png')).setName('welcome-image.png');

  return attachment;
};

const addGuestRoles = async (
  serverConfig: ServerConfig,
  newMember: GuildMember,
  client: NovaClient
) => {
  try {
    const guestRoleIds = (serverConfig.guestRoleIds ?? '').split(',');
    const guildRoles = await newMember.guild.roles.fetch();

    await newMember.roles.add(guildRoles.filter((role) => guestRoleIds.includes(role.id)));
  } catch (e) {
    Logger.writeError(
      `Adding guest roles failed in guildMemberUpdate for server: ${serverConfig.id}.`,
      e
    );
    const audit = new EmbedCompatLayer()
      .setColor(EmbedColours.negative)
      .setAuthor({
        name: newMember.displayName,
        iconURL: newMember.displayAvatarURL(),
      })
      .setDescription('Unable to provide guest role(s) to user.')
      .addField('ID', newMember.user.id)
      .setTimestamp();

    return ChannelService.sendAuditMessage(client, serverConfig, audit);
  }
};

const sendScreenAudit = async (
  serverConfig: ServerConfig,
  newMember: GuildMember,
  client: NovaClient
) => {
  try {
    const audit = new EmbedCompatLayer()
      .setColor(EmbedColours.neutral)
      .setAuthor({
        name: newMember.displayName,
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
    oldMember.pending || (oldMember.pending === null && newMember.roles.cache.size === 1);

  if (notPassedScreen && !newMember.pending) {
    await sendScreenAudit(serverConfig, newMember, client);

    if (serverConfig.guestRoleIds) {
      await addGuestRoles(serverConfig, newMember, client).catch((err: unknown) =>
        Logger.writeError(
          `Guest role audit failed in guildMemberUpdate for ${serverConfig.id}.`,
          err
        )
      );
    }

    if (
      serverConfig.systemMessagesEnabled &&
      (serverConfig.welcomeMessage || serverConfig.welcomeMessageBackgroundUrl)
    ) {
      try {
        let attachment: AttachmentBuilder | undefined;
        let content: string | undefined;
        if (serverConfig.welcomeMessageBackgroundUrl) {
          attachment = await getWelcomeImage(serverConfig, newMember);
        }

        if (serverConfig.welcomeMessage) {
          content = await getWelcomeMessage(serverConfig, newMember);
        }

        const systemChannel = newMember.guild.systemChannel;
        if (!systemChannel) {
          throw new Error(`No system channel for guild ${newMember.guild.id}.`);
        }
        await systemChannel.send({
          content,
          files: attachment ? [attachment] : undefined,
        });
      } catch (e) {
        Logger.writeError(
          `Sending welcome message failed in guildMemberUpdate for server: ${serverConfig.serverId}.`,
          e
        );
        const audit = new EmbedCompatLayer()
          .setColor(EmbedColours.negative)
          .setAuthor({
            name: newMember.displayName,
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
