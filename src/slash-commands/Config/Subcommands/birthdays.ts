import { defineSubcommandGroup } from '../../../framework/command';
import { BirthdayManager } from '../../../utilities/BirthdayManager';

export const BirthdaysGroup = defineSubcommandGroup({
  name: 'birthdays',
  description: 'Configure the birthday calendar for this server',
  subcommands: [
    {
      name: 'create',
      description: 'Creates or recreates a birthday calendar for this server',
      options: (sub) =>
        sub.addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel to create the birthday calendar in')
            .setRequired(true)
        ),
      run: async (ctx) => {
        const { id } = ctx.interaction.options.getChannel('channel', true);
        const channel = ctx.guild.channels.cache.get(id);

        if (!channel || !channel.isTextBased()) {
          await ctx.reply({ content: 'Provided channel is not a text channel', ephemeral: false });
          return;
        }

        const birthdaysCalendar = await channel.send({
          content: 'Placeholder calendar message - populating...',
        });
        ctx.config.birthdayCalendarMessagePath = `${birthdaysCalendar.channel.id}/${birthdaysCalendar.id}`;
        await ctx.config.save();
        await BirthdayManager.populateCalendars(ctx.interaction.client, ctx.guild.id);

        await ctx.reply('Birthday calendar has been created.');
      },
    },
    {
      name: 'sync',
      description: 'Syncs the birthday calendar for this server',
      run: async (ctx) => {
        try {
          await BirthdayManager.populateCalendars(ctx.interaction.client, ctx.config.serverId);
        } catch {
          await ctx.reply('An error ocurred running the calendar sync for this server.');
          return;
        }

        await ctx.reply(`Calendar successfully synchronised for ${ctx.guild.name}.`);
      },
    },
  ],
});

export default BirthdaysGroup;
