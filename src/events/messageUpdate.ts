import { EmbedColours } from '../resources/EmbedColours';
import { defineEvent } from '../framework/event';
import { ChannelService } from '../utilities/ChannelService';
import { ConfigService } from '../utilities/ConfigService';
import { EmbedCompatLayer } from '../types/EmbedCompatLayer';

export default defineEvent({
  name: 'messageUpdate',
  run: async (client, oldMessage, newMessage) => {
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
  },
});
