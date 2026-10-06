import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { defineSubcommandGroup } from '../../../framework/command.ts';
import { UserError } from '../../../framework/errors.ts';
import {
  calendarMessageUrl,
  deleteCalendarMessage,
  refreshCalendar,
} from '../../../services/BirthdayService.ts';
import { updateConfig } from '../../../services/ConfigService.ts';
import { resolveTextChannel } from '../../../services/MemberResolver.ts';

export const BirthdaysGroup = defineSubcommandGroup({
  name: 'birthdays',
  description: 'Configure the birthday calendar for this server',
  subcommands: [
    {
      name: 'create',
      description: 'Create or recreate a birthday calendar for this server',
      defer: 'ephemeral',
      options: (sub) =>
        sub.addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel to create the birthday calendar in')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
      run: async (ctx) => {
        const { id } = ctx.interaction.options.getChannel('channel', true);
        const channel = await resolveTextChannel(ctx.guild, id);
        if (!channel) {
          throw new UserError('I cannot post in that channel. Pick a text channel.');
        }
        const me = ctx.guild.members.me;
        const perms = me ? channel.permissionsFor(me) : null;
        if (
          !perms?.has(PermissionFlagsBits.ViewChannel) ||
          !perms.has(PermissionFlagsBits.SendMessages)
        ) {
          throw new UserError('I need permission to view and send messages in that channel.');
        }

        const client = ctx.interaction.client;
        const previousPath = ctx.config.birthdayCalendarMessagePath;

        // Send first and persist before touching the old calendar, so a failure at either step
        // leaves the existing calendar and its stored path intact.
        const message = await channel.send({
          content: 'Placeholder calendar message - populating...',
          allowedMentions: { parse: [] },
        });
        const path = `${message.channelId}/${message.id}`;
        try {
          ctx.config = await updateConfig(ctx.app, ctx.config.serverId, {
            birthdayCalendarMessagePath: path,
          });
        } catch (error) {
          await message.delete().catch((deleteError: unknown) => {
            ctx.app.logger.warn(
              'Could not remove the new birthday calendar message after a failed save',
              { guild: ctx.guild.id },
              deleteError,
            );
          });
          throw error;
        }

        const status = await refreshCalendar(ctx.app, client, ctx.config);
        if (previousPath && previousPath !== path) {
          await deleteCalendarMessage(client, previousPath);
        }
        const link = calendarMessageUrl(ctx.guild.id, path);
        await ctx.reply(
          status === 'updated'
            ? `Birthday calendar has been created: ${link}`
            : `Birthday calendar message was created (${link}) but could not be populated yet; try \`/config birthdays sync\`.`,
        );
      },
    },
    {
      name: 'sync',
      description: 'Sync the birthday calendar for this server',
      defer: 'ephemeral',
      run: async (ctx) => {
        const status = await refreshCalendar(ctx.app, ctx.interaction.client, ctx.config);
        const replies = {
          updated: `Calendar successfully synchronised for ${ctx.guild.name}.`,
          'not-configured':
            'The birthday calendar is not configured. Use `/config birthdays create`.',
          'channel-missing':
            'The calendar channel is missing or inaccessible. Recreate it with `/config birthdays create`.',
          'message-missing':
            'The calendar message is missing. Recreate it with `/config birthdays create`.',
          failed: 'An error occurred syncing the calendar. Try again later.',
        } as const;
        await ctx.reply(replies[status]);
      },
    },
    {
      name: 'remove',
      description: 'Remove the birthday calendar for this server',
      defer: 'ephemeral',
      run: async (ctx) => {
        if (!ctx.config.birthdayCalendarMessagePath) {
          throw new UserError('There is no birthday calendar configured.');
        }
        await deleteCalendarMessage(ctx.interaction.client, ctx.config.birthdayCalendarMessagePath);
        ctx.config = await updateConfig(ctx.app, ctx.config.serverId, {
          birthdayCalendarMessagePath: null,
        });
        await ctx.reply('Birthday calendar removed.');
      },
    },
  ],
});

export default BirthdaysGroup;
