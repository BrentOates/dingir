import {
  ChatInputCommandInteraction,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandUserOption,
} from 'discord.js';
import { EmbedColours } from '../../resources/EmbedColours';
import { EmbedCompatLayer } from '../../types/EmbedCompatLayer';
import { SlashCommand } from '../../types/SlashCommand';
import { UserProfileService } from '../../utilities/UserProfileService';
import { requireGuild } from '../../utilities/requireGuild';

const execute = async (cmd: ChatInputCommandInteraction) => {
  const user = cmd.options.getUser('member', true);
  const guild = requireGuild(cmd);
  const member = guild.members.cache.get(user.id);
  if (!member) {
    return cmd.reply({ content: 'Could not find that member in this server.', ephemeral: true });
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

  return cmd.reply({
    embeds: [embed],
    ephemeral: true,
  });
};

const commandData = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Fetches profiles for server members')
  .addUserOption((opt: SlashCommandUserOption) =>
    opt.setName('member').setDescription('Member to fetch profile for').setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts([InteractionContextType.Guild]);

const slashCommand: SlashCommand = {
  commandData: commandData,
  execute: execute,
};
export = slashCommand;
