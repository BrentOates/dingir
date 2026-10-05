import { defineEvent } from '../framework/event';
import { complete, completedScreening } from '../services/OnboardingService';
import { ConfigService } from '../services/ConfigService';
import { Logger } from '../utilities/Logger';

export default defineEvent({
  name: 'guildMemberUpdate',
  run: async (client, oldMember, newMember) => {
    if (oldMember.partial) {
      Logger.debug('Skipping onboarding: previous member state unknown', {
        guild: newMember.guild.id,
        member: newMember.id,
      });
      return;
    }
    if (!completedScreening(oldMember, newMember)) {
      return;
    }

    const config = await ConfigService.getConfig(newMember.guild.id);
    await complete(client, newMember, config);
  },
});
