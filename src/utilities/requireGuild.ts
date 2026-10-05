import { ChatInputCommandInteraction, Guild } from 'discord.js';

export const requireGuild = (cmd: ChatInputCommandInteraction): Guild => {
  if (!cmd.guild) {
    throw new Error(`Command ${cmd.commandName} was used outside of a guild.`);
  }
  return cmd.guild;
};
