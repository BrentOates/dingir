import { defineEvent } from '../framework/event.ts';
import { EmbedColours } from '../resources/EmbedColours.ts';
import { AuditEmbed, memberAuditEmbed } from '../services/AuditEmbed.ts';
import { sendAudit } from '../services/AuditService.ts';
import { getConfig } from '../services/ConfigService.ts';

export default defineEvent({
  name: 'messageDelete',
  run: async (app, client, message) => {
    if (!message.guildId) {
      return;
    }
    if (message.author?.bot) {
      return;
    }
    if (message.author && app.honeypot.isActive(message.guildId, message.author.id)) {
      return;
    }

    const config = await getConfig(app.db, message.guildId);

    if (message.partial || !message.author) {
      const audit = new AuditEmbed()
        .setColor(EmbedColours.neutral)
        .setDescription('A message was deleted (not cached — content unavailable)')
        .setTimestamp()
        .addField('Channel', `<#${message.channelId}>`)
        .addField('Message ID', message.id);
      await sendAudit(app, client, config, audit);
      return;
    }

    const audit = memberAuditEmbed(message.author, EmbedColours.neutral, 'A message was deleted')
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
    await sendAudit(app, client, config, audit);
  },
});
