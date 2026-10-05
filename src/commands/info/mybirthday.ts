import { DateTime } from 'luxon';
import { type CommandContext, defineCommand } from '../../framework/command.ts';
import { UserError } from '../../framework/errors.ts';
import { isValidBirthday, nextOccurrence } from '../../services/BirthdayDates.ts';
import { refreshCalendar } from '../../services/BirthdayService.ts';
import { clearBirthday, setBirthday } from '../../services/UserProfileService.ts';

const refresh = async (ctx: CommandContext): Promise<void> => {
  try {
    const status = await refreshCalendar(ctx.app, ctx.interaction.client, ctx.config);
    if (status !== 'updated' && status !== 'not-configured') {
      ctx.app.logger.warn('Birthday calendar not refreshed', { guild: ctx.guild.id, status });
    }
  } catch (error) {
    ctx.app.logger.error('Birthday calendar refresh failed', { guild: ctx.guild.id }, error);
  }
};

export default defineCommand({
  name: 'mybirthday',
  description: 'Manage your birthday in this server',
  subcommands: [
    {
      name: 'set',
      description: 'Set your birthday in this server',
      options: (sub) =>
        sub
          .addIntegerOption((opt) =>
            opt
              .setName('day')
              .setDescription('Day of the month of your birthday')
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(31)
          )
          .addIntegerOption((opt) =>
            opt
              .setName('month')
              .setDescription('Month of your birthday')
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(12)
          ),
      run: async (ctx) => {
        const day = ctx.interaction.options.getInteger('day', true);
        const month = ctx.interaction.options.getInteger('month', true);

        if (!isValidBirthday(month, day)) {
          throw new UserError('That date is invalid; check the day and month and try again.');
        }

        await setBirthday(ctx.app.db, ctx.guild.id, ctx.interaction.user.id, month, day);

        const zone = ctx.app.env.timezone;
        const now = DateTime.fromJSDate(ctx.app.clock());
        const next = nextOccurrence(month, day, now, zone);
        const isToday = next.hasSame(now.setZone(zone), 'day');
        const text = isToday
          ? 'today 🎉'
          : next.setLocale('en-GB').toLocaleString(DateTime.DATE_FULL);
        await ctx.reply(`Saved. Your next birthday is ${text}`);
        await refresh(ctx);
      },
    },
    {
      name: 'clear',
      description: 'Remove your birthday from this server',
      run: async (ctx) => {
        const cleared = await clearBirthday(
          ctx.app.db,
          ctx.guild.id,
          ctx.interaction.user.id
        );
        await ctx.reply(
          cleared ? 'Your birthday has been removed.' : "You don't have a birthday set."
        );
        if (cleared) {
          await refresh(ctx);
        }
      },
    },
  ],
});
