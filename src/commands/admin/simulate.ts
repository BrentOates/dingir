import type { GuildMember, SlashCommandSubcommandBuilder } from 'discord.js';
import { type CommandContext, defineCommand } from '../../framework/command.ts';
import { UserError } from '../../framework/errors.ts';
import { resolveMember } from '../../services/MemberResolver.ts';
import { auditJoin, complete, formatOnboardingSummary } from '../../services/OnboardingService.ts';
import { fitMessage } from '../../utilities/format.ts';

const NO_MENTIONS = { parse: [] };

const targetOf = async (ctx: CommandContext): Promise<GuildMember> => {
  const user = ctx.interaction.options.getUser('member');
  if (!user) {
    return ctx.member;
  }
  const member = await resolveMember(ctx.guild, user);
  if (!member) {
    throw new UserError(`Could not find ${user.toString()} in this server.`);
  }
  return member;
};

const memberOption = (description: string) => (b: SlashCommandSubcommandBuilder) =>
  b.addUserOption((opt) => opt.setName('member').setDescription(description));

export default defineCommand({
  name: 'simulate',
  description: 'Simulate member events safely (no roles or welcome messages are applied)',
  adminOnly: true,
  subcommands: [
    {
      name: 'join',
      description: 'Send only the "member joined" audit for a member (no roles or welcome)',
      defer: 'ephemeral',
      options: memberOption('Member to simulate joining as (defaults to you)'),
      run: async (ctx) => {
        const target = await targetOf(ctx);
        const sent = await auditJoin(ctx.app, ctx.interaction.client, target, ctx.config);
        await ctx.reply({
          content: sent
            ? `Sent the "member joined" audit for ${target.toString()}. No roles or welcome message were applied.`
            : 'No audit message was sent: the audit channel is not configured or not usable.',
          allowedMentions: NO_MENTIONS,
        });
      },
    },
    {
      name: 'onboard',
      description: 'Dry run: show what onboarding (guest roles, welcome) would do for a member',
      defer: 'ephemeral',
      options: memberOption('Member to simulate completing onboarding as (defaults to you)'),
      run: async (ctx) => {
        const target = await targetOf(ctx);
        const result = await complete(ctx.app, ctx.interaction.client, target, ctx.config, {
          dryRun: true,
        });
        const payload = result.welcomePayload;
        const imageNote = payload?.imageError ? `\n\nImage failed: ${payload.imageError}` : '';
        const welcome = payload ? `\n\nWelcome preview:\n${payload.content ?? '*(no text)*'}` : '';
        const head = `Dry run for ${target.toString()} (nothing was changed or sent):\n${formatOnboardingSummary(result)}${imageNote}`;
        await ctx.reply({
          content: fitMessage(head, welcome),
          files: payload?.image ? [payload.image] : undefined,
          allowedMentions: NO_MENTIONS,
        });
      },
    },
  ],
});
