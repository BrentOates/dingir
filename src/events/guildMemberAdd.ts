import { defineEvent } from '../framework/event.ts';
import { auditJoin, complete } from '../services/OnboardingService.ts';
import { ConfigService } from '../services/ConfigService.ts';

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
