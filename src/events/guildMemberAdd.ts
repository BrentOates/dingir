import { GuildMember } from 'discord.js';
import { NovaClient } from '../client/NovaClient';
import { RunFunction } from '../types/Event';
import { EmbedColours } from '../resources/EmbedColours';
import { ChannelService } from '../utilities/ChannelService';
import { ConfigService } from '../utilities/ConfigService';
import { EmbedCompatLayer } from '../types/EmbedCompatLayer';

export const name = 'guildMemberAdd';
export const run: RunFunction = async (
  client: NovaClient,
  member: GuildMember
) => {
  const serverConfig = await ConfigService.getConfig(member.guild.id);

  const audit = new EmbedCompatLayer()
    .setColor(EmbedColours.positive)
    .setAuthor({
      name: member.user.tag,
      iconURL: member.displayAvatarURL(),
    })
    .setDescription('New member joined')
    .addField('ID', member.user.id)
    .setTimestamp();

  await ChannelService.sendAuditMessage(client, serverConfig, audit);
};
