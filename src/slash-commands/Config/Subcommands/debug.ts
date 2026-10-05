import { defineSubcommandGroup } from '../../../framework/command';

export const DebugGroup = defineSubcommandGroup({
  name: 'debug',
  description: 'Toggle the debugging mode for this server',
  subcommands: [
    {
      name: 'set',
      description: "Set's whether debug mode is enabled for this server",
      options: (sub) =>
        sub.addBooleanOption((opt) =>
          opt
            .setName('enabled')
            .setDescription('Whether to enable debug mode or not')
            .setRequired(true)
        ),
      run: async (ctx) => {
        ctx.config.debug = ctx.interaction.options.getBoolean('enabled', true);
        await ctx.config.save();

        await ctx.reply(`Debug mode is: ${ctx.config.debug ? 'enabled' : 'disabled'}`);
      },
    },
    {
      name: 'get',
      description: "Get's whether debug mode is enabled or not",
      run: async (ctx) => {
        await ctx.reply(`Debug mode is: ${ctx.config.debug ? 'enabled' : 'disabled'}`);
      },
    },
  ],
});

export default DebugGroup;
