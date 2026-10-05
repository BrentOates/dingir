import { defineEvent } from '../framework/event';
import { EmbedColours } from '../resources/EmbedColours';
import { AuditEmbed } from '../services/AuditEmbed';
import { sendAudit } from '../services/AuditService';
import { ConfigService } from '../services/ConfigService';
import { HoneyPotEnforcementService } from '../services/HoneyPotEnforcementService';

export default defineEvent({
  name: 'messageDelete',
  run: async (client, message) => {
    if (!message.guildId) {
      return;
    }
    if (message.author?.bot) {
      return;
    }
    if (message.author && HoneyPotEnforcementService.isActive(message.guildId, message.author.id)) {
      return;
    }

    const config = await ConfigService.getConfig(message.guildId);

    if (message.partial || !message.author) {
      const audit = new AuditEmbed()
        .setColor(EmbedColours.neutral)
        .setDescription('A message was deleted (not cached — content unavailable)')
        .setTimestamp()
        .addField('Channel', `<#${message.channelId}>`)
        .addField('Message ID', message.id);
      await sendAudit(client, config, audit);
      return;
    }

    const audit = AuditEmbed.forMember(message.author, EmbedColours.neutral, 'A message was deleted')
      .addField('Channel', `<#${message.channelId}>`)
      .addField('Author ID', message.author.id);
    if (message.content) {
      audit.addField('Message', message.content);
    }
    if (message.attachments.size > 0) {
      const names = [...message.attachments.values()].map((a) => a.name).join(', ');
      audit.addField('Attachments', `${message.attachments.size}: ${names}`);
    }
    if (message.embeds.length > 0) {
      audit.addField('Embeds', message.embeds.length.toString());
    }
    await sendAudit(client, config, audit);
  },
});
