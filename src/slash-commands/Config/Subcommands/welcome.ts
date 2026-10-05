import { CommandContext, defineSubcommandGroup } from '../../../framework/command';

const imageChoice = {
  name: 'Welcome Image',
  value: 'welcomeMessageBackgroundUrl',
} as const;
const msgChoice = {
  name: 'Welcome Message',
  value: 'welcomeMessage',
} as const;

type WelcomeField = typeof imageChoice.value | typeof msgChoice.value;

const fieldOf = (ctx: CommandContext) =>
  ctx.interaction.options.getString('content', true) as WelcomeField;

const get = async (ctx: CommandContext) => {
  const value = ctx.config[fieldOf(ctx)];

  await ctx.reply(`Current value is: ${value ? value : 'Not Set'}`);
};

export const WelcomeGroup = defineSubcommandGroup({
  name: 'welcome',
  description: 'Control welcome information for this server',
  subcommands: [
    {
      name: 'set',
      description: "Set's the welcome information for this server",
      options: (sub) =>
        sub
          .addStringOption((opt) =>
            opt
              .setName('content')
              .setDescription('Set the welcome image, or text?')
              .setRequired(true)
              .addChoices(imageChoice, msgChoice)
          )
          .addStringOption((opt) =>
            opt
              .setName('value')
              .setDescription('URL to the welcome image, or the welcome text')
              .setRequired(true)
          ),
      run: async (ctx) => {
        ctx.config[fieldOf(ctx)] = ctx.interaction.options.getString('value', true);
        await ctx.config.save();

        await get(ctx);
      },
    },
    {
      name: 'get',
      description: "Get's the welcome information for this server",
      options: (sub) =>
        sub.addStringOption((opt) =>
          opt
            .setName('content')
            .setDescription('Get the welcome image, or text?')
            .setRequired(true)
            .addChoices(imageChoice, msgChoice)
        ),
      run: get,
    },
    {
      name: 'clear',
      description: "Clear's the welcome information for this server",
      options: (sub) =>
        sub.addStringOption((opt) =>
          opt
            .setName('content')
            .setDescription('Clear the welcome image, or text?')
            .setRequired(true)
            .addChoices(imageChoice, msgChoice)
        ),
      run: async (ctx) => {
        ctx.config[fieldOf(ctx)] = null;
        await ctx.config.save();

        await get(ctx);
      },
    },
  ],
});

export default WelcomeGroup;
