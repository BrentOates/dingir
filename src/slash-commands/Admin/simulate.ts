import { GuildMember } from 'discord.js';
import { CommandContext, defineCommand } from '../../framework/command';

const findMember = (ctx: CommandContext) => {
  const members = ctx.guild.members.cache;
  const user = ctx.interaction.options.getUser('member');
  return (user ? members.get(user.id) : undefined) ?? members.get(ctx.interaction.user.id);
};

export default defineCommand({
  name: 'simulate',
  description: 'Simulate events in this server',
  adminOnly: true,
  subcommands: [
    {
      name: 'join',
      description: 'Simulate someone joining this server',
      options: (b) =>
        b.addUserOption((opt) =>
          opt.setName('member').setDescription('Member to simulate joining as')
        ),
      run: async (ctx) => {
        const guildMember = findMember(ctx);
        if (!guildMember) {
          await ctx.reply('Could not find that member.');
          return;
        }
        ctx.interaction.client.emit('guildMemberAdd', guildMember);

        await ctx.reply(`Emitted guildMemberAdd for ${guildMember.toString()}`);
      },
    },
    {
      name: 'screen',
      description: 'Simulate someone passing screening in this server',
      options: (b) =>
        b.addUserOption((opt) =>
          opt.setName('member').setDescription('Member to simulate passing screening as')
        ),
      run: async (ctx) => {
        const guildMember = findMember(ctx);
        if (!guildMember) {
          await ctx.reply('Could not find that member.');
          return;
        }

        const oldMemberMock = Object.assign({}, guildMember, {
          pending: true,
        }) as unknown as GuildMember;
        const newMemberMock = guildMember;

        ctx.interaction.client.emit('guildMemberUpdate', oldMemberMock, newMemberMock);

        await ctx.reply(`Emitted guildMemberUpdate for ${guildMember.toString()}`);
      },
    },
  ],
});
