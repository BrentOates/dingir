import { Message } from 'discord.js';
import { NovaClient } from '../client/NovaClient';
import { EmbedColours } from '../resources/EmbedColours';
import { RunFunction } from '../types/Event';
import { ChannelService } from '../utilities/ChannelService';
import { ConfigService } from '../utilities/ConfigService';
import { EmbedCompatLayer } from '../types/EmbedCompatLayer';

export const name = 'messageUpdate';
export const run: RunFunction = async (
  client: NovaClient,
  oldMessage: Message,
  newMessage: Message
) => {
  if (!oldMessage.content) {
    return;
  }

  if (newMessage.partial) {
    newMessage = await newMessage.fetch();
  }

  if (newMessage.author.bot || !newMessage.guild) {
    return;
  }

  if (oldMessage.content === newMessage.content) {
    return;
  }

  const audit = new EmbedCompatLayer()
    .setColor(EmbedColours.neutral)
    .setAuthor({
      name: newMessage.author.tag,
      iconURL: newMessage.author.displayAvatarURL(),
    })
    .setDescription('A message was edited')
    .addField('Previous', oldMessage.content)
    .addField('Current', newMessage.content)
    .setTimestamp();

  const serverConfig = await ConfigService.getConfig(newMessage.guild.id);
  await ChannelService.sendAuditMessage(client, serverConfig, audit);
};
