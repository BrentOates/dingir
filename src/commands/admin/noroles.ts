import { defineCommand } from '../../framework/command.ts';
import { fetchAllMembers } from '../../services/MemberResolver.ts';
import { buildMemberListing } from '../../services/MemberListing.ts';

export default defineCommand({
  name: 'noroles',
  description: 'List members of this guild with no roles assigned',
  adminOnly: true,
  defer: 'ephemeral',
  run: async (ctx) => {
    const all = await fetchAllMembers(ctx.guild);
    const members = [...all.values()].filter(
      (member) => !member.user.bot && member.roles.cache.size === 1,
    );
    await ctx.reply(
      buildMemberListing('**Users with no roles**', 'There are no users with no roles.', members),
    );
  },
});
