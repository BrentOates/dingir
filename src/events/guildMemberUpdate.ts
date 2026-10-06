import { defineEvent } from '../framework/event.ts';
import { complete, completedScreening } from '../services/OnboardingService.ts';
import { getConfig } from '../services/ConfigService.ts';

export default defineEvent({
  name: 'guildMemberUpdate',
  run: async (app, client, oldMember, newMember) => {
    if (oldMember.partial) {
      app.logger.debug('Skipping onboarding: previous member state unknown', {
        guild: newMember.guild.id,
        member: newMember.id,
      });
      return;
    }
    if (newMember.user.bot) {
      return;
    }
    if (!completedScreening(oldMember, newMember)) {
      return;
    }

    const config = await getConfig(app, newMember.guild.id);
    await complete(app, client, newMember, config);
  },
});
