import { type CommandContext, defineSubcommandGroup } from '../../../framework/command.ts';
import { UserError } from '../../../framework/errors.ts';
import { type ServerConfigPatch, updateConfig } from '../../../services/ConfigService.ts';
import {
  complete,
  expandWelcomeMessage,
  MAX_WELCOME_LENGTH,
} from '../../../services/OnboardingService.ts';
import { fitMessage } from '../../../utilities/format.ts';
import { isHttpUrl, render } from '../../../services/WelcomeImage.ts';

export const MAX_WELCOME_MESSAGE_LENGTH = 1500;

/** Worst-case length once `{member}` becomes a mention (snowflakes are at most 20 digits). */
const expandedLength = (text: string): number => expandWelcomeMessage(text, '0'.repeat(20)).length;

export const validateWelcomeMessage = (text: string): string | null =>
  text.trim() === ''
    ? 'The welcome message cannot be empty. Use /config welcome clear to remove it.'
    : text.length > MAX_WELCOME_MESSAGE_LENGTH
      ? `The welcome message is too long (${text.length} characters, maximum ${MAX_WELCOME_MESSAGE_LENGTH}).`
      : expandedLength(text) > MAX_WELCOME_LENGTH
        ? `Once every {member} is expanded to a mention the message would be ${expandedLength(text)} characters, over Discord's ${MAX_WELCOME_LENGTH} character limit. Shorten it or use fewer {member}.`
        : null;

export const validateImageUrl = (url: string): string | null =>
  isHttpUrl(url) ? null : 'The image URL must start with http:// or https://';

const NO_MENTIONS = { parse: [] };

const setMessage = async (ctx: CommandContext) => {
  const text = ctx.interaction.options.getString('text', true);
  const problem = validateWelcomeMessage(text);
  if (problem) {
    throw new UserError(problem);
  }
  ctx.config = await updateConfig(ctx.app, ctx.config.serverId, {
    welcomeMessage: text,
  });
  await ctx.reply({
    content: 'Welcome message saved. Use `{member}` in the text to mention the new member.',
    allowedMentions: NO_MENTIONS,
  });
};

const setImage = async (ctx: CommandContext) => {
  const url = ctx.interaction.options.getString('url', true).trim();
  const problem = validateImageUrl(url);
  if (problem) {
    throw new UserError(problem);
  }
  try {
    await render(ctx.app, ctx.member, url);
  } catch (error) {
    throw new UserError(
      `That image could not be used: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  ctx.config = await updateConfig(ctx.app, ctx.config.serverId, {
    welcomeMessageBackgroundUrl: url,
  });
  await ctx.reply('Welcome image saved. Use /config welcome preview to see how it looks.');
};

const get = async (ctx: CommandContext) => {
  const { welcomeMessage, welcomeMessageBackgroundUrl } = ctx.config;
  const image = `\nWelcome image: ${welcomeMessageBackgroundUrl ?? 'Not set'}`;
  await ctx.reply({
    content:
      fitMessage(
        'Welcome message: ',
        welcomeMessage ? `\n${welcomeMessage}` : 'Not set',
        2000 - image.length,
      ) + image,
    allowedMentions: NO_MENTIONS,
  });
};

const clear = async (ctx: CommandContext) => {
  const which = ctx.interaction.options.getString('which', true);
  const patch: ServerConfigPatch = {};
  if (which === 'message' || which === 'all') {
    patch.welcomeMessage = null;
  }
  if (which === 'image' || which === 'all') {
    patch.welcomeMessageBackgroundUrl = null;
  }
  ctx.config = await updateConfig(ctx.app, ctx.config.serverId, patch);
  await ctx.reply(`Cleared welcome ${which === 'all' ? 'message and image' : which}.`);
};

const preview = async (ctx: CommandContext) => {
  const result = await complete(ctx.app, ctx.interaction.client, ctx.member, ctx.config, {
    dryRun: true,
  });
  const payload = result.welcomePayload;
  if (!payload) {
    await ctx.reply(`Nothing would be sent: ${result.welcome.replace(/^(skipped|failed):/, '')}.`);
    return;
  }
  const notes = payload.imageError ? `\n\nThe image failed to render: ${payload.imageError}` : '';
  await ctx.reply({
    content: fitMessage(
      'Preview of the welcome message for you:\n\n',
      `${payload.content ?? '*(no text)*'}${notes}`,
    ),
    files: payload.image ? [payload.image] : undefined,
    allowedMentions: NO_MENTIONS,
  });
};

export const WelcomeGroup = defineSubcommandGroup({
  name: 'welcome',
  description: 'Control welcome information for this server',
  subcommands: [
    {
      name: 'set-message',
      description: 'Set the welcome message ({member} is replaced by a mention)',
      options: (sub) =>
        sub.addStringOption((opt) =>
          opt
            .setName('text')
            .setDescription('The welcome text; use {member} to mention the new member')
            .setMaxLength(MAX_WELCOME_MESSAGE_LENGTH)
            .setRequired(true),
        ),
      run: setMessage,
    },
    {
      name: 'set-image',
      description: 'Set the background image used for the welcome image',
      defer: 'ephemeral',
      options: (sub) =>
        sub.addStringOption((opt) =>
          opt
            .setName('url')
            .setDescription('http(s) URL of the background image')
            .setRequired(true),
        ),
      run: setImage,
    },
    {
      name: 'get',
      description: 'Show the welcome message and image for this server',
      run: get,
    },
    {
      name: 'clear',
      description: 'Clear the welcome message, image, or both',
      options: (sub) =>
        sub.addStringOption((opt) =>
          opt
            .setName('which')
            .setDescription('What to clear')
            .setRequired(true)
            .addChoices(
              { name: 'Welcome message', value: 'message' },
              { name: 'Welcome image', value: 'image' },
              { name: 'Both', value: 'all' },
            ),
        ),
      run: clear,
    },
    {
      name: 'preview',
      description: 'Preview the welcome message as it would be sent for you',
      defer: 'ephemeral',
      run: preview,
    },
  ],
});

export default WelcomeGroup;
