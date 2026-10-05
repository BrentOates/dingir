import { EmbedColours } from '../resources/EmbedColours';
import { defineEvent } from '../framework/event';
import { ChannelService } from '../utilities/ChannelService';
import { ConfigService } from '../utilities/ConfigService';
import { EmbedCompatLayer } from '../types/EmbedCompatLayer';
import { UserProfileService } from '../utilities/UserProfileService';
import { HoneyPotEnforcementService } from '../utilities/HoneyPotEnforcementService';

export default defineEvent({
  name: 'guildMemberRemove',
  run: async (client, member) => {
    if (member.user.bot) {
      return;
    }

    if (HoneyPotEnforcementService.isActive(member.guild.id, member.user.id)) {
      await UserProfileService.deleteUser(member.guild.id, member.user.id);
      return;
    }

    const dataDeleted = await UserProfileService.deleteUser(member.guild.id, member.user.id);

    const audit = new EmbedCompatLayer()
      .setColor(EmbedColours.negative)
      .setAuthor({
        name: member.displayName,
        iconURL: member.displayAvatarURL(),
      })
      .setDescription('Member left')
      .addField('ID', member.user.id)
      .addField('Member data cleanup', dataDeleted ? 'Deleted' : 'No stored member data')
      .setTimestamp();

    const serverConfig = await ConfigService.getConfig(member.guild.id);
    await ChannelService.sendAuditMessage(client, serverConfig, audit);
  },
});
