import { defineEvent } from '../framework/event.ts';
import { EmbedColours } from '../resources/EmbedColours.ts';
import { memberAuditEmbed } from '../services/AuditEmbed.ts';
import { sendAudit } from '../services/AuditService.ts';
import { refreshCalendar } from '../services/BirthdayService.ts';
import { getConfig } from '../services/ConfigService.ts';
import { deleteUser } from '../services/UserProfileService.ts';

export default defineEvent({
  name: 'guildMemberRemove',
  run: async (app, client, member) => {
    const user = member.user;
    if (user.bot) {
      return;
    }

    const removed = await deleteUser(app.db, member.guild.id, user.id);
    const config = await getConfig(app, member.guild.id);
    if (removed?.birthdayMonth != null) {
      // The calendar must not keep listing a member who is no longer here.
      await refreshCalendar(app, client, config);
    }
    if (app.honeypot.isActive(member.guild.id, user.id)) {
      return;
    }

    const audit = memberAuditEmbed(
      member.partial ? user : member,
      EmbedColours.negative,
      'Member left',
    )
      .addField('ID', user.id)
      .addField('Member data cleanup', removed ? 'Deleted' : 'No stored member data');

    await sendAudit(app, client, config, audit);
  },
});
