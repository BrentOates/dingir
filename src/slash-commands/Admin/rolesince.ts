import { DateTime } from 'luxon';
import { defineCommand } from '../../framework/command';

export default defineCommand({
  name: 'rolesince',
  description: 'Returns members in the given role for the specified number of days',
  adminOnly: true,
  options: (b) =>
    b
      .addRoleOption((opt) =>
        opt.setName('role').setDescription('Role to search again').setRequired(true)
      )
      .addNumberOption((opt) =>
        opt.setName('days').setDescription('Minimum number of days in the role')
      ),
  run: async (ctx) => {
    const role = ctx.interaction.options.getRole('role', true);
    const days = ctx.interaction.options.getNumber('days') ?? 0;

    const allMembers = await ctx.guild.members.fetch();

    const members = allMembers.filter((member) => {
      const joined = DateTime.fromMillis(member.joinedTimestamp ?? Date.now()).startOf('day');
      const daysInServer = DateTime.local().startOf('day').diff(joined, 'days').days;
      return member.roles.cache.find((r) => r.id === role.id) && daysInServer >= days;
    });

    let response: string;

    if (members.size < 1) {
      response = `There are no users in ${role.toString()} that have been in the server for at least ${days} days.`;
    } else {
      response = `**Users in ${role.toString()} that have been in the server for at least ${days} days.**\n------\n`;
      for (const mem of members.values()) {
        if (mem.partial) {
          await mem.fetch();
        }
        response += `${mem.toString()} joined <t:${Math.floor((mem.joinedTimestamp ?? 0) / 1000)}:R>\n`;
      }
    }

    await ctx.reply({
      content: response,
      allowedMentions: {
        parse: [],
      },
    });
  },
});
