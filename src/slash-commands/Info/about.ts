import { defineCommand } from '../../framework/command';
import { EmbedColours } from '../../resources/EmbedColours';
import { EmbedCompatLayer } from '../../types/EmbedCompatLayer';
import * as packageJson from '../../../package.json';

export default defineCommand({
  name: 'about',
  description: 'Returns info about the bot and server',
  run: async (ctx) => {
    const cmd = ctx.interaction;
    const version = packageJson.version;
    const projectUrl = packageJson.repository;

    const embed = new EmbedCompatLayer()
      .setColor(EmbedColours.positive)
      .setAuthor({
        name: cmd.client.user.tag,
        iconURL: cmd.client.user.displayAvatarURL(),
      })
      .setDescription('Dingir Discord Bot')
      .addField('Version', version.length > 0 ? version : 'Unknown')
      .addField('Project URL', projectUrl.url)
      .addField('Servers', cmd.client.guilds.cache.size.toString())
      .setTimestamp();

    await ctx.reply({ embeds: [embed] });
  },
});
