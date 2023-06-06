import { GuildMember } from 'discord.js';
import { NovaClient } from '../client/NovaClient';
import { EmbedColours } from '../resources/EmbedColours';
import { RunFunction } from '../types/Event';
import { ChannelService } from '../utilities/ChannelService';
import { ConfigService } from '../utilities/ConfigService';
import { EmbedCompatLayer } from '../types/EmbedCompatLayer';
import { UserProfileService } from '../utilities/UserProfileService';

export const name = 'guildMemberRemove';
export const run: RunFunction = async (
  client: NovaClient,
  member: GuildMember
) => {
  if (member.user.bot) {
    return;
  }

  const dataDeleted = await UserProfileService.deleteUser(
    member.guild.id,
    member.user.id
  );

  const audit = new EmbedCompatLayer()
    .setColor(EmbedColours.negative)
    .setAuthor({
      name: member.displayName,
      iconURL: member.displayAvatarURL(),
    })
    .setDescription('Member left')
    .addField('ID', member.user.id)
    .addField('Member data deleted', dataDeleted ? 'Successful' : 'Failed')
    .setTimestamp();

  const serverConfig = await ConfigService.getConfig(member.guild.id);
  await ChannelService.sendAuditMessage(client, serverConfig, audit);
};
