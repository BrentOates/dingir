import { defineEvent } from '../framework/event.ts';
import { EmbedColours } from '../resources/EmbedColours.ts';
import { memberAuditEmbed } from '../services/AuditEmbed.ts';
import { sendAudit } from '../services/AuditService.ts';
import { getConfig } from '../services/ConfigService.ts';
import { deleteUser } from '../services/UserProfileService.ts';

export default defineEvent({
  name: 'guildMemberRemove',
  run: async (app, client, member) => {
    const user = member.user;
    if (user.bot) {
      return;
    }

    const dataDeleted = await deleteUser(app.db, member.guild.id, user.id);
    if (app.honeypot.isActive(member.guild.id, user.id)) {
      return;
    }

    const audit = memberAuditEmbed(member.partial ? user : member, EmbedColours.negative, 'Member left')
      .addField('ID', user.id)
      .addField('Member data cleanup', dataDeleted ? 'Deleted' : 'No stored member data');

    const config = await getConfig(app.db, member.guild.id);
    await sendAudit(app, client, config, audit);
  },
});
