import { DateTime } from 'luxon';
import { defineCommand } from '../../framework/command';
import { BirthdayManager } from '../../utilities/BirthdayManager';
import { UserProfileService } from '../../utilities/UserProfileService';

export default defineCommand({
  name: 'mybirthday',
  description: 'Set your birthday in this server',
  options: (b) =>
    b
      .addNumberOption((opt) =>
        opt
          .setName('day')
          .setDescription('Day of the month of your birthday')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(31)
      )
      .addNumberOption((opt) =>
        opt
          .setName('month')
          .setDescription('Month of your birthday')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(12)
      ),
  run: async (ctx) => {
    const cmd = ctx.interaction;
    let day = cmd.options.getNumber('day', true);
    const month = cmd.options.getNumber('month', true);

    let alteredForLeap = false;

    const now = DateTime.local();

    if (!now.isInLeapYear && day === 29 && month === 2) {
      day--;
      alteredForLeap = true;
    }

    let nextDate = DateTime.local(now.year, month, day);

    if (nextDate <= now) {
      nextDate = nextDate.plus({
        year: 1,
      });
      if (nextDate.isInLeapYear && alteredForLeap) {
        nextDate = nextDate.plus({
          day: 1,
        });
      }
    }

    if (!nextDate.isValid) {
      await ctx.reply(
        'It looks like that date was invalid, make sure a valid day and month were given'
      );
      return;
    }

    const guildId = ctx.guild.id;
    const userProfile = await UserProfileService.getUserProfile(guildId, cmd.user.id);

    userProfile.birthdayDay = day;
    userProfile.birthdayMonth = month;

    await userProfile.save();

    await ctx.reply(
      `I've set your next birthday to ${nextDate.toLocaleString(DateTime.DATE_FULL)}!`
    );
    await BirthdayManager.populateCalendars(cmd.client, guildId);
  },
});
