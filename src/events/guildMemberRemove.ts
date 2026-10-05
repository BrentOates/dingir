import { defineEvent } from '../framework/event.ts';
import { EmbedColours } from '../resources/EmbedColours.ts';
import { AuditEmbed } from '../services/AuditEmbed.ts';
import { sendAudit } from '../services/AuditService.ts';
import { ConfigService } from '../services/ConfigService.ts';
import { HoneyPotEnforcementService } from '../services/HoneyPotEnforcementService.ts';
import { UserProfileService } from '../services/UserProfileService.ts';

export default defineEvent({
  name: 'guildMemberRemove',
  run: async (client, member) => {
    const user = member.user;
    if (user.bot) {
      return;
    }

    const dataDeleted = await UserProfileService.deleteUser(member.guild.id, user.id);
    if (HoneyPotEnforcementService.isActive(member.guild.id, user.id)) {
      return;
    }

    const audit = AuditEmbed.forMember(member.partial ? user : member, EmbedColours.negative, 'Member left')
      .addField('ID', user.id)
      .addField('Member data cleanup', dataDeleted ? 'Deleted' : 'No stored member data');

    const config = await ConfigService.getConfig(member.guild.id);
    await sendAudit(client, config, audit);
  },
});
