import { defineEvent } from '../framework/event.ts';
import { EmbedColours } from '../resources/EmbedColours.ts';
import { memberAuditEmbed } from '../services/AuditEmbed.ts';
import { sendAudit } from '../services/AuditService.ts';
import { getConfig } from '../services/ConfigService.ts';

export default defineEvent({
  name: 'messageUpdate',
  run: async (app, client, oldMessage, partialNew) => {
    if (!partialNew.guildId) {
      return;
    }

    let newMessage = partialNew;
    if (newMessage.partial) {
      try {
        newMessage = await newMessage.fetch();
      } catch {
        return;
      }
    }

    if (newMessage.author.bot || !newMessage.guildId) {
      return;
    }

    const previous = oldMessage.partial ? null : oldMessage.content;
    if (previous === newMessage.content) {
      return;
    }

    const audit = memberAuditEmbed(newMessage.author, EmbedColours.neutral, 'A message was edited')
      .addField('Channel', `<#${newMessage.channelId}>`)
      .addField('Previous', previous === null ? '*(not cached)*' : previous)
      .addField('Current', newMessage.content)
      .addField('Jump to message', newMessage.url);

    const config = await getConfig(app.db, newMessage.guildId);
    await sendAudit(app, client, config, audit);
  },
});
