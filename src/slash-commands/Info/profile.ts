import { defineCommand } from '../../framework/command';
import { EmbedColours } from '../../resources/EmbedColours';
import { EmbedCompatLayer } from '../../types/EmbedCompatLayer';
import { UserProfileService } from '../../utilities/UserProfileService';

export default defineCommand({
  name: 'profile',
  description: 'Fetches profiles for server members',
  adminOnly: true,
  options: (b) =>
    b.addUserOption((opt) =>
      opt.setName('member').setDescription('Member to fetch profile for').setRequired(true)
    ),
  run: async (ctx) => {
    const user = ctx.interaction.options.getUser('member', true);
    const guild = ctx.guild;
    const member = guild.members.cache.get(user.id);
    if (!member) {
      await ctx.reply('Could not find that member in this server.');
      return;
    }

    const userProfile = await UserProfileService.getUserProfile(guild.id, member.id);

    const embed = new EmbedCompatLayer()
      .setThumbnail(member.displayAvatarURL())
      .setColor(EmbedColours.info)
      .setTitle('User Profile')
      .setTimestamp()
      .addField('Member', member.toString())
      .addField('Nickname', member.nickname ? member.nickname : 'Not set')
      .addField('Username', member.user.tag.endsWith('#0') ? member.user.username : member.user.tag)
      .addField('Joined', `<t:${Math.floor((member.joinedTimestamp ?? 0) / 1000)}:R>`)
      .addField('Screening', member.pending ? 'Not completed' : 'Passed')
      .addField('Activity Score', userProfile ? userProfile.activityScore.toString() : 'Not found')
      .addField('ID', member.user.id);

    await ctx.reply({ embeds: [embed] });
  },
});
