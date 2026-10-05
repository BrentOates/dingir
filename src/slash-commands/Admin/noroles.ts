import { defineCommand } from '../../framework/command';

export default defineCommand({
  name: 'noroles',
  description: 'Returns members of this guild with no roles assigned',
  adminOnly: true,
  run: async (ctx) => {
    const allMembers = await ctx.guild.members.fetch();

    const members = allMembers.filter((member) => member.roles.cache.size === 1);

    let response: string;

    if (members.size < 1) {
      response = 'There are no users with no roles.';
    } else {
      response = '**Users with no roles**\n------\n';
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
