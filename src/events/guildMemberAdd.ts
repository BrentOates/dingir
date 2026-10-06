import { defineEvent } from '../framework/event.ts';
import { getConfig } from '../services/ConfigService.ts';
import { auditJoin, complete } from '../services/OnboardingService.ts';
import { claimOnboarding, startMembership } from '../services/UserProfileService.ts';

export default defineEvent({
  name: 'guildMemberAdd',
  run: async (app, client, member) => {
    const config = await getConfig(app, member.guild.id);
    const ids = [app.db, member.guild.id, member.id] as const;

    // A join is a new membership. Reset and claim before the first network await, so a concurrent
    // leave or update event sees the new state and the join audit cannot delay or duplicate it.
    let claimed = false;
    if (!member.user.bot) {
      await startMembership(...ids, app.clock(), member.pending);
      claimed = !member.pending && (await claimOnboarding(...ids, app.clock()));
    }

    await auditJoin(app, client, member, config);

    if (claimed) {
      await complete(app, client, member, config, { skipAudit: true });
    }
  },
});
