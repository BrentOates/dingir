import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, SlashCommandRoleOption, SlashCommandNumberOption } from 'discord.js';
import { DateTime } from 'luxon';
import { SlashCommand } from '../../types/SlashCommand';

const execute = async (cmd: ChatInputCommandInteraction) => {
  const role = cmd.options.getRole('role');
  const days = cmd.options.getNumber('days') ?? 0;

  const allMembers = await cmd.guild.members.fetch();

  const members = allMembers.filter((member) => {
    const joined = DateTime.fromMillis(member.joinedTimestamp).startOf('day');
    const daysInServer = DateTime.local()
      .startOf('day')
      .diff(joined, 'days')
      .toObject().days;
    return (
      member.roles.cache.find((r) => r.id === role.id) &&
      daysInServer >= days
    );
  });

  let response: string;

  if (members.size < 1) {
    response = `There are no users in ${role.toString()} that have been in the server for at least ${days ?? 0
      } days.`;
  } else {
    response = `**Users in ${role.toString()} that have been in the server for at least ${days ?? 0
      } days.**\n------\n`;
    members.each(async (mem) => {
      if (mem.partial) {
        await mem.fetch();
      }
      response += `${mem.toString()} joined <t:${Math.floor(
        mem.joinedTimestamp / 1000
      )}:R>\n`;
    });
  }

  return cmd.reply({
    content: response,
    allowedMentions: {
      parse: [],
    },
    ephemeral: true
  });
};

const commandData = new SlashCommandBuilder()
  .setName('rolesince')
  .setDescription('Returns members in the given role for the specified number of days')
  .addRoleOption((opt: SlashCommandRoleOption) => opt
    .setName('role')
    .setDescription('Role to search again')
    .setRequired(true))
  .addNumberOption((opt: SlashCommandNumberOption) => opt
    .setName('days')
    .setDescription('Minimum number of days in the role'))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

const slashCommand: SlashCommand = {
  commandData: commandData,
  execute: execute
};
export = slashCommand;