import { defineEvent } from '../framework/event.ts';
import { completedScreening, onboard } from '../services/OnboardingService.ts';
import { getConfig } from '../services/ConfigService.ts';
import { currentOnboardingState } from '../services/ScreeningService.ts';
import { recordScreeningPending } from '../services/UserProfileService.ts';

export default defineEvent({
  name: 'guildMemberUpdate',
  run: async (app, client, oldMember, newMember) => {
    if (newMember.user.bot) {
      return;
    }
    const state = await currentOnboardingState(app, newMember);

    if (newMember.pending === true) {
      await recordScreeningPending(app.db, newMember.guild.id, newMember.id, app.clock());
      return;
    }
    if (newMember.pending !== false) {
      return;
    }

    // With an unknown previous state only a recorded pending state proves screening just ended.
    const screeningEnded = oldMember.partial
      ? state.screeningPendingAt !== null
      : completedScreening(oldMember, newMember);
    if (!screeningEnded) {
      return;
    }

    await onboard(app, client, newMember, await getConfig(app, newMember.guild.id));
  },
});
