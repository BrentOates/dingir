import { defineEvent } from '../framework/event';
import { auditJoin, complete } from '../services/OnboardingService';
import { ConfigService } from '../utilities/ConfigService';

export default defineEvent({
  name: 'guildMemberAdd',
  run: async (client, member) => {
    const config = await ConfigService.getConfig(member.guild.id);

    await auditJoin(client, member, config);

    if (!member.pending) {
      await complete(client, member, config);
    }
  },
});
