import { EmbedBuilder } from 'discord.js';
import { defineCommand } from '../../framework/command.ts';
import { EmbedColours } from '../../resources/EmbedColours.ts';
import { toRepoUrl, formatUptime } from '../../utilities/format.ts';
import packageJson from '../../../package.json' with { type: 'json' };

export default defineCommand({
  name: 'about',
  description: 'Show information about Dingir and this server',
  defer: 'ephemeral',
  run: async (ctx) => {
    const version = packageJson.version;
    const projectUrl = packageJson.repository.url;
    const repoUrl = toRepoUrl(projectUrl);
    const serverCount = ctx.interaction.client.guilds.cache.size;
    const guildName = ctx.guild.name;
    const memberCount = ctx.guild.memberCount;
    const uptime = formatUptime(ctx.interaction.client.uptime);

    const embed = new EmbedBuilder()
      .setColor(EmbedColours.info)
      .setTitle('About Dingir')
      .setDescription('A Discord bot for the Irkallu server')
      .addFields(
        { name: 'Version', value: version, inline: false },
        { name: 'Source', value: repoUrl, inline: false },
        { name: 'Servers', value: serverCount.toString(), inline: false },
        { name: 'This server', value: `${guildName} (${memberCount} members)`, inline: false },
        { name: 'Uptime', value: uptime, inline: false },
      );

    await ctx.reply({ embeds: [embed] });
  },
});
