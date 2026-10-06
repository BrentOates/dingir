import { EmbedBuilder } from 'discord.js';
import { DateTime } from 'luxon';
import { defineCommand } from '../../framework/command.ts';
import { UserError } from '../../framework/errors.ts';
import { EmbedColours } from '../../resources/EmbedColours.ts';
import { resolveMember } from '../../services/MemberResolver.ts';
import { findUserProfile } from '../../services/UserProfileService.ts';

export default defineCommand({
  name: 'profile',
  description: 'Fetch profiles for server members',
  adminOnly: true,
  options: (b) =>
    b.addUserOption((opt) =>
      opt.setName('member').setDescription('Member to fetch profile for').setRequired(true),
    ),
  run: async (ctx) => {
    const user = ctx.interaction.options.getUser('member', true);
    const member = await resolveMember(ctx.guild, user);
    if (!member) {
      throw new UserError("That user isn't a member of this server.");
    }

    const profile = await findUserProfile(ctx.app.db, ctx.guild.id, member.id);
    const birthday =
      profile?.birthdayMonth && profile.birthdayDay
        ? DateTime.utc(2024, profile.birthdayMonth, profile.birthdayDay)
            .setLocale('en-GB')
            .toFormat('d MMMM')
        : null;

    const embed = new EmbedBuilder()
      .setThumbnail(member.displayAvatarURL())
      .setColor(EmbedColours.info)
      .setTitle('User Profile')
      .setTimestamp()
      .addFields(
        { name: 'Member', value: member.toString() },
        { name: 'Nickname', value: member.nickname ?? 'Not set' },
        { name: 'Username', value: member.user.username },
        {
          name: 'Joined',
          value:
            member.joinedTimestamp === null
              ? 'Unknown'
              : `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
        },
        { name: 'Onboarding', value: member.pending ? 'Not completed' : 'Completed' },
        { name: 'Activity Score', value: String(profile?.activityScore ?? 0) },
      );
    if (birthday) {
      embed.addFields({ name: 'Birthday', value: birthday });
    }
    embed.addFields({ name: 'ID', value: member.id });

    await ctx.reply({ embeds: [embed] });
  },
});
