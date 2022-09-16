import { ChannelType, Message } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { EmbedColours } from '../../resources/EmbedColours';
import { Command } from '../../types/Command';
import { EmbedCompatLayer } from '../../types/EmbedCompatLayer';
import { UserProfileService } from '../../utilities/UserProfileService';

const run = async (client: NovaClient, message: Message): Promise<any> => {
  const mem = message.mentions.members.first();

  if (!mem) {
    return message.channel.send(
      'Unable to find that member, or a member was not provided.'
    );
  }

  const userProfile = await UserProfileService.getUserProfile(
    message.guild.id,
    mem.user.id
  );

  const embed = new EmbedCompatLayer()
    .setThumbnail(mem.displayAvatarURL())
    .setColor(EmbedColours.info)
    .setTitle('User Profile')
    .setTimestamp()
    .addField('Member', mem.toString())
    .addField('Nickname', mem.nickname ? mem.nickname : 'Not set')
    .addField('User tag', mem.user.tag)
    .addField('Joined', `<t:${Math.floor(mem.joinedTimestamp / 1000)}:R>`)
    .addField('Screening', mem.pending ? 'Not completed' : 'Passed')
    .addField(
      'Activity Score',
      userProfile ? userProfile.activityScore.toString() : 'Not found'
    )
    .addField('ID', mem.user.id);

  return message.channel.send({
    embeds: [embed],
  });
};

const command: Command = {
  name: 'profile',
  title: "Display a member's profile",
  description:
    'Displays some useful administration information for the given member.',
  usage: 'profile <user mention>',
  example: 'profile @discord',
  admin: true,
  deleteCmd: false,
  limited: false,
  channels: [ChannelType.GuildText],
  run: run,
};

export = command;
