import type { Client, Guild, GuildMember } from 'discord.js';
import type { App } from '../../src/app.ts';
import type { ServerConfig } from '../../src/db/schema.ts';
import type { CommandContext, ReplyOptions } from '../../src/framework/command.ts';
import { fakeConfig, fakeGuild, fakeMember } from './discord.ts';
import { fakeInteraction } from './interaction.ts';

export interface FakeCommandParts {
  guild?: Guild;
  member?: GuildMember;
  config?: ServerConfig;
  client?: Client;
  subcommand?: string;
}

/** A CommandContext whose reply() records normalised ReplyOptions instead of calling Discord. */
export function fakeCommandContext(
  app: App,
  options: Record<string, unknown> = {},
  parts: FakeCommandParts = {}
) {
  const { interaction } = fakeInteraction({ options, subcommand: parts.subcommand });
  if (parts.client) {
    Object.assign(interaction, { client: parts.client });
  }
  const replies: ReplyOptions[] = [];
  const ctx: CommandContext = {
    app,
    interaction,
    guild: parts.guild ?? fakeGuild(),
    member: parts.member ?? fakeMember('user-1'),
    config: parts.config ?? fakeConfig(),
    reply: async (response) => {
      replies.push(typeof response === 'string' ? { content: response } : response);
    },
  };
  return { ctx, replies, interaction };
}
