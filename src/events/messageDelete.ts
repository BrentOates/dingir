import { EmbedColours } from '../resources/EmbedColours';
import { defineEvent } from '../framework/event';
import { ChannelService } from '../utilities/ChannelService';
import { ConfigService } from '../utilities/ConfigService';
import { EmbedCompatLayer } from '../types/EmbedCompatLayer';
import { UserProfileService } from '../utilities/UserProfileService';
import { HoneyPotEnforcementService } from '../utilities/HoneyPotEnforcementService';

export default defineEvent({
  name: 'messageDelete',
  run: async (client, message) => {
    if (!message.author || !message.guild) {
      return;
    }

    if (HoneyPotEnforcementService.isActive(message.guild.id, message.author.id)) {
      return;
    }

    const serverConfig = await ConfigService.getConfig(message.guild.id);

    await UserProfileService.decrementActivityScore(message.guild.id, message.author.id);

    const audit = new EmbedCompatLayer()
      .setColor(EmbedColours.neutral)
      .setAuthor({
        name: message.author.tag,
        iconURL: message.author.displayAvatarURL(),
      })
      .setDescription('A message was deleted')
      .setTimestamp();

    if (message.content) {
      audit.addField('Message', message.content);
    }
    if (message.embeds.length > 0) {
      audit.addField('Embeds', message.embeds.length.toString());
    }
    if (message.attachments.size > 0) {
      audit.addField('Attachments', message.attachments.size.toString());
    }

    await ChannelService.sendAuditMessage(client, serverConfig, audit);
  },
});
