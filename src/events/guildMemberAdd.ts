import { defineEvent } from '../framework/event.ts';
import { getConfig } from '../services/ConfigService.ts';
import { auditJoin, complete } from '../services/OnboardingService.ts';

export default defineEvent({
  name: 'guildMemberAdd',
  run: async (app, client, member) => {
    const config = await getConfig(app, member.guild.id);

    await auditJoin(app, client, member, config);

    if (!member.user.bot && !member.pending) {
      await complete(app, client, member, config);
    }
  },
});
