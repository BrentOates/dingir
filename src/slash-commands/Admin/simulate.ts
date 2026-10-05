import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
  SlashCommandUserOption,
  InteractionContextType,
} from 'discord.js';
import { SlashCommand } from '../../types/SlashCommand';
import { requireGuild } from '../../utilities/requireGuild';

const findMember = (cmd: ChatInputCommandInteraction) => {
  const members = requireGuild(cmd).members.cache;
  const user = cmd.options.getUser('member');
  return (user ? members.get(user.id) : undefined) ?? members.get(cmd.user.id);
};

const testJoin = async (cmd: ChatInputCommandInteraction) => {
  const guildMember = findMember(cmd);
  if (!guildMember) {
    return cmd.reply({ content: 'Could not find that member.', ephemeral: true });
  }
  cmd.client.emit('guildMemberAdd', guildMember);

  await cmd.reply({
    content: `Emitted guildMemberAdd for ${guildMember.toString()}`,
    ephemeral: true,
  });
};

const testScreen = async (cmd: ChatInputCommandInteraction) => {
  const guildMember = findMember(cmd);
  if (!guildMember) {
    return cmd.reply({ content: 'Could not find that member.', ephemeral: true });
  }

  const oldMemberMock = Object.assign({}, guildMember, {
    pending: true,
  });
  const newMemberMock = guildMember;

  cmd.client.emit('guildMemberUpdate', oldMemberMock, newMemberMock);

  await cmd.reply({
    content: `Emitted guildMemberUpdate for ${guildMember.toString()}`,
    ephemeral: true,
  });
};

const execute = async (cmd: ChatInputCommandInteraction) => {
  const subCommand = cmd.options.getSubcommand();

  if (!subCommand) {
    return cmd.reply({ content: 'This command is misconfigured', ephemeral: true });
  }

  if (subCommand == 'join') {
    return testJoin(cmd);
  } else if (subCommand == 'screen') {
    return testScreen(cmd);
  } else {
    return cmd.reply({
      content: 'A valid option was not supplied for this command',
      ephemeral: true,
    });
  }
};

const commandData = new SlashCommandBuilder()
  .setName('simulate')
  .setDescription('Simulate events in this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts([InteractionContextType.Guild])
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub
      .setName('join')
      .setDescription('Simulate someone joining this server')
      .addUserOption((opt: SlashCommandUserOption) =>
        opt.setName('member').setDescription('Member to simulate joining as')
      )
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub
      .setName('screen')
      .setDescription('Simulate someone passing screening in this server')
      .addUserOption((opt: SlashCommandUserOption) =>
        opt.setName('member').setDescription('Member to simulate passing screening as')
      )
  );

const slashCommand: SlashCommand = {
  commandData: commandData,
  execute: execute,
};
export = slashCommand;
