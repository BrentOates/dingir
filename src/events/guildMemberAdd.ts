import { defineEvent } from '../framework/event.ts';
import { getConfig } from '../services/ConfigService.ts';
import { auditJoin, complete } from '../services/OnboardingService.ts';
import { clearOnboarded, startScreeningCycle } from '../services/UserProfileService.ts';

export default defineEvent({
  name: 'guildMemberAdd',
  run: async (app, client, member) => {
    const config = await getConfig(app, member.guild.id);

    await auditJoin(app, client, member, config);

    if (member.user.bot) {
      return;
    }
    if (member.pending) {
      await startScreeningCycle(app.db, member.guild.id, member.id, app.clock());
    } else {
      // A join is a new membership, so any recorded onboarding is stale.
      await clearOnboarded(app.db, member.guild.id, member.id);
      await complete(app, client, member, config, { skipAudit: true });
    }
  },
});
