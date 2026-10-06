import { defineEvent } from '../framework/event.ts';
import { complete, completedScreening } from '../services/OnboardingService.ts';
import { getConfig } from '../services/ConfigService.ts';
import { getOnboardingState, markScreeningPending } from '../services/UserProfileService.ts';

export default defineEvent({
  name: 'guildMemberUpdate',
  run: async (app, client, oldMember, newMember) => {
    if (newMember.user.bot) {
      return;
    }
    const ids = { guild: newMember.guild.id, member: newMember.id };
    const skip = (reason: string): void => {
      app.logger.info(`Skipping onboarding: ${reason}`, ids);
    };
    const state = await getOnboardingState(app.db, newMember.guild.id, newMember.id);

    if (newMember.pending === true) {
      // Keep the recorded state fresh; onboarding from an unknown state requires it.
      if (state.screeningPendingAt === null && state.onboardedAt === null) {
        await markScreeningPending(app.db, newMember.guild.id, newMember.id, app.clock());
      }
      return;
    }

    if (oldMember.partial) {
      // The previous state is unknown, so only a recorded pending state proves screening just ended.
      if (newMember.pending !== false) {
        return;
      }
      if (state.onboardedAt) {
        skip('previous member state unknown and onboarding already recorded');
        return;
      }
      if (!state.screeningPendingAt) {
        skip('previous member state unknown and no pending screening recorded');
        return;
      }
    } else {
      if (!completedScreening(oldMember, newMember)) {
        return;
      }
      if (state.onboardedAt) {
        skip('onboarding already recorded');
        return;
      }
    }

    await complete(app, client, newMember, await getConfig(app, newMember.guild.id));
  },
});
