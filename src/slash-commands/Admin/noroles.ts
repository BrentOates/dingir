import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} from 'discord.js';
import { SlashCommand } from '../../types/SlashCommand';
import { requireGuild } from '../../utilities/requireGuild';

const execute = async (cmd: ChatInputCommandInteraction) => {
  const allMembers = await requireGuild(cmd).members.fetch();

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

  return cmd.reply({
    content: response,
    allowedMentions: {
      parse: [],
    },
    ephemeral: true,
  });
};

const commandData = new SlashCommandBuilder()
  .setName('noroles')
  .setDescription('Returns members of this guild with no roles assigned')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts([InteractionContextType.Guild]);

const slashCommand: SlashCommand = {
  commandData: commandData,
  execute: execute,
};
export = slashCommand;
