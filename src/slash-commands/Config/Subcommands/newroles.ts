import { CommandContext, defineSubcommandGroup } from '../../../framework/command';
import { EmbedColours } from '../../../resources/EmbedColours';
import { EmbedCompatLayer } from '../../../types/EmbedCompatLayer';
import { ChannelService } from '../../../utilities/ChannelService';
import { Logger } from '../../../utilities/Logger';

const get = async (ctx: CommandContext) => {
  const { config, guild, interaction: cmd } = ctx;
  if (!config.guestRoleIds) {
    await ctx.reply({ content: 'No guest roles configured for this server', ephemeral: false });
    return;
  }

  const roleIds: string[] = config.guestRoleIds.split(',');
  const roles = guild.roles.cache.filter((r) => roleIds.includes(r.id));
  const member = guild.members.cache.get(cmd.user.id);

  const audit = new EmbedCompatLayer()
    .setColor(EmbedColours.info)
    .setAuthor({
      name: member?.displayName ?? cmd.user.username,
      iconURL: cmd.user.displayAvatarURL(),
    })
    .setDescription(`New user roles ${!config.guestRoleIds ? 'Removed' : 'Updated'}`)
    .setTimestamp();

  if (config.guestRoleIds) {
    audit.addField('New user roles', roles.map((r) => r.toString()).join('\n'));
  }

  if (roles.size !== roleIds.length) {
    audit.addField(
      'WARNING',
      'Not all roles configured are available in this server, please reconfigure new user roles'
    );
  }

  await ChannelService.sendAuditMessage(cmd.client, config, audit).catch((err: unknown) =>
    Logger.writeError('Could not send new roles audit.', err)
  );
  await ctx.reply(`New user roles ${!config.guestRoleIds ? 'Removed' : 'Updated'}`);
};

export const NewRolesGroup = defineSubcommandGroup({
  name: 'newroles',
  description: 'Control the roles assigned to newly screened members',
  subcommands: [
    {
      name: 'get',
      description: 'Gets the roles assigned to newly screened members',
      run: get,
    },
    {
      name: 'set',
      description: 'Sets the roles of newly screened members',
      options: (sub) =>
        sub
          .addRoleOption((option) =>
            option
              .setName('role-one')
              .setDescription('First role to give to newly screened members')
              .setRequired(true)
          )
          .addRoleOption((option) =>
            option
              .setName('role-two')
              .setDescription('Second optional role to give to newly screened members')
          ),
      run: async (ctx) => {
        const role1 = ctx.interaction.options.getRole('role-one', true);
        const role2 = ctx.interaction.options.getRole('role-two');

        ctx.config.guestRoleIds = [role1.id, role2?.id].filter(Boolean).join(',');
        await ctx.config.save();

        await get(ctx);
      },
    },
    {
      name: 'clear',
      description: 'Clears the roles assigned to newly screened members',
      run: async (ctx) => {
        ctx.config.guestRoleIds = null;
        await ctx.config.save();

        await get(ctx);
      },
    },
  ],
});

export default NewRolesGroup;
