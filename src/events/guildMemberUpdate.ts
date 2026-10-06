import { defineEvent } from '../framework/event.ts';
import { complete, completedScreening, parseRoleIds } from '../services/OnboardingService.ts';
import { getConfig } from '../services/ConfigService.ts';

export default defineEvent({
  name: 'guildMemberUpdate',
  run: async (app, client, oldMember, newMember) => {
    if (newMember.user.bot) {
      return;
    }
    const ids = { guild: newMember.guild.id, member: newMember.id };

    if (oldMember.partial) {
      // The previous state is unknown, so infer "finished screening but not yet onboarded"
      // from the guest roles: onboarding hands them out, so holding one means already done.
      if (newMember.pending !== false) {
        return;
      }
      const config = await getConfig(app, newMember.guild.id);
      const guestRoleIds = parseRoleIds(config.guestRoleIds);
      if (guestRoleIds.length === 0) {
        app.logger.info(
          'Skipping onboarding: previous member state unknown and no guest roles',
          ids,
        );
        return;
      }
      if (guestRoleIds.some((id) => newMember.roles.cache.has(id))) {
        app.logger.debug('Skipping onboarding: member already holds a guest role', ids);
        return;
      }
      await complete(app, client, newMember, config);
      return;
    }
    if (!completedScreening(oldMember, newMember)) {
      return;
    }

    const config = await getConfig(app, newMember.guild.id);
    await complete(app, client, newMember, config);
  },
});
