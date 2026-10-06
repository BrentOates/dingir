import { defineEvent } from '../framework/event.ts';
import { complete, completedScreening } from '../services/OnboardingService.ts';
import { getConfig } from '../services/ConfigService.ts';
import { getOnboardedAt } from '../services/UserProfileService.ts';

/** How recently a member must have joined for an unknown-previous-state update to onboard them. */
const RECENT_JOIN_MS = 7 * 24 * 60 * 60 * 1000;

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

    if (oldMember.partial) {
      // The previous state is unknown, so only trust "finished screening, not yet onboarded"
      // when the member is no longer pending, never onboarded, and joined recently.
      if (newMember.pending !== false) {
        return;
      }
      if (await getOnboardedAt(app.db, newMember.guild.id, newMember.id)) {
        skip('previous member state unknown and onboarding already recorded');
        return;
      }
      const joined = newMember.joinedTimestamp;
      if (
        joined === null ||
        joined === undefined ||
        app.clock().getTime() - joined > RECENT_JOIN_MS
      ) {
        skip('previous member state unknown and member did not join recently');
        return;
      }
      await complete(app, client, newMember, await getConfig(app, newMember.guild.id));
      return;
    }
    if (!completedScreening(oldMember, newMember)) {
      return;
    }
    if (await getOnboardedAt(app.db, newMember.guild.id, newMember.id)) {
      skip('onboarding already recorded');
      return;
    }

    const config = await getConfig(app, newMember.guild.id);
    await complete(app, client, newMember, config);
  },
});
