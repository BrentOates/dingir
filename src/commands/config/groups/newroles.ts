import { Role } from 'discord.js';
import { type CommandContext, defineSubcommandGroup } from '../../../framework/command.ts';
import { UserError } from '../../../framework/errors.ts';
import { EmbedColours } from '../../../resources/EmbedColours.ts';
import { memberAuditEmbed } from '../../../services/AuditEmbed.ts';
import { sendAudit } from '../../../services/AuditService.ts';
import { updateConfig } from '../../../services/ConfigService.ts';
import { parseRoleIds, roleProblem } from '../../../services/OnboardingService.ts';

const ROLE_OPTIONS = ['role-one', 'role-two', 'role-three'] as const;
const NO_MENTIONS = { parse: [] };

const auditChange = (ctx: CommandContext, description: string, roleIds: string[]) => {
  const embed = memberAuditEmbed(ctx.member, EmbedColours.info, description);
  if (roleIds.length > 0) {
    embed.addField('New member roles', roleIds.map((id) => `<@&${id}>`).join('\n'));
  }
  return sendAudit(ctx.app, ctx.interaction.client, ctx.config, embed);
};

const get = async (ctx: CommandContext) => {
  const ids = parseRoleIds(ctx.config.guestRoleIds);
  if (ids.length === 0) {
    await ctx.reply('No new-member roles are configured.');
    return;
  }
  const lines = ids.map((id) =>
    ctx.guild.roles.cache.has(id) ? `<@&${id}>` : `${id} (this role no longer exists)`
  );
  await ctx.reply({
    content: `Roles given to members when they complete onboarding:\n${lines.join('\n')}`,
    allowedMentions: NO_MENTIONS,
  });
};

export const NewRolesGroup = defineSubcommandGroup({
  name: 'newroles',
  description: 'Roles given to members when they complete onboarding',
  subcommands: [
    {
      name: 'get',
      description: 'Show the roles given to members when they complete onboarding',
      run: get,
    },
    {
      name: 'set',
      description: 'Set the roles given to members when they complete onboarding',
      options: (sub) =>
        sub
          .addRoleOption((option) =>
            option
              .setName(ROLE_OPTIONS[0])
              .setDescription('Role to give to members when they complete onboarding')
              .setRequired(true)
          )
          .addRoleOption((option) =>
            option.setName(ROLE_OPTIONS[1]).setDescription('Optional second role to give')
          )
          .addRoleOption((option) =>
            option.setName(ROLE_OPTIONS[2]).setDescription('Optional third role to give')
          ),
      run: async (ctx) => {
        const roles = new Map<string, Role>();
        for (const name of ROLE_OPTIONS) {
          const role = ctx.interaction.options.getRole(name);
          if (role) {
            roles.set(role.id, role);
          }
        }

        const problems = [...roles.values()].flatMap((role) => {
          const problem = roleProblem(ctx.guild, role);
          return problem ? [`${role.name}: ${problem}`] : [];
        });
        if (problems.length > 0) {
          throw new UserError(`Those roles cannot be used:\n${problems.join('\n')}`);
        }

        const ids = [...roles.keys()];
        ctx.config = await updateConfig(ctx.app.db, ctx.config.serverId, {
          guestRoleIds: ids.join(','),
        });
        await auditChange(ctx, 'New member roles updated', ids);
        await ctx.reply({
          content: `New-member roles set to ${ids.map((id) => `<@&${id}>`).join(', ')}.`,
          allowedMentions: NO_MENTIONS,
        });
      },
    },
    {
      name: 'clear',
      description: 'Clear the roles given to members when they complete onboarding',
      run: async (ctx) => {
        ctx.config = await updateConfig(ctx.app.db, ctx.config.serverId, { guestRoleIds: null });
        await auditChange(ctx, 'New member roles cleared', []);
        await ctx.reply('New-member roles cleared.');
      },
    },
  ],
});

export default NewRolesGroup;
