import { defineCommand } from '../../framework/command.ts';
import { buildMemberListing, wholeDaysSinceJoin } from '../../services/MemberListing.ts';

export default defineCommand({
  name: 'rolesince',
  description: 'List members of a role who joined the server at least N days ago',
  adminOnly: true,
  defer: 'ephemeral',
  options: (b) =>
    b
      .addRoleOption((opt) =>
        opt.setName('role').setDescription('Role to search').setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('days')
          .setDescription('Minimum number of days since the member joined the server')
          .setMinValue(0)
      ),
  run: async (ctx) => {
    const role = ctx.interaction.options.getRole('role', true);
    const days = ctx.interaction.options.getInteger('days') ?? 0;

    await ctx.guild.members.fetch();
    const members = [...role.members.values()].filter((member) => {
      if (member.user.bot) {
        return false;
      }
      const joinedDays = wholeDaysSinceJoin(member);
      return joinedDays === null ? days === 0 : joinedDays >= days;
    });

    await ctx.reply(
      buildMemberListing(
        `**Users in ${role.toString()} that joined the server at least ${days} days ago**`,
        `There are no users in ${role.toString()} that joined the server at least ${days} days ago.`,
        members
      )
    );
  },
});
