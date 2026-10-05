import type { ChatInputCommandInteraction } from 'discord.js';
import { fakeGuild, type SentPayload, stub } from './discord.ts';

export interface Call {
  method: 'reply' | 'deferReply' | 'editReply' | 'followUp';
  payload: SentPayload;
}

export interface FakeInteractionOptions {
  commandName?: string;
  group?: string | null;
  subcommand?: string | null;
  options?: Record<string, unknown>;
  chatInput?: boolean;
  inGuild?: boolean;
  deferred?: boolean;
  replied?: boolean;
  guildId?: string;
  userId?: string;
  guild?: unknown;
}

export interface FakeInteraction {
  interaction: ChatInputCommandInteraction<'cached'>;
  calls: Call[];
}

export function fakeInteraction(opts: FakeInteractionOptions = {}): FakeInteraction {
  const calls: Call[] = [];
  const values = opts.options ?? {};
  const guildId = opts.guildId ?? 'guild-1';

  const required = <T>(name: string, req?: boolean): T | null => {
    const value = (values[name] ?? null) as T | null;
    if (req && value === null) {
      throw new Error(`Required option "${name}" missing`);
    }
    return value;
  };

  const state = {
    commandName: opts.commandName ?? 'test',
    deferred: opts.deferred ?? false,
    replied: opts.replied ?? false,
    guildId,
    guild: opts.guild ?? fakeGuild(),
    member: { id: opts.userId ?? 'user-1' },
    user: { id: opts.userId ?? 'user-1' },
    createdTimestamp: Date.now(),
    isChatInputCommand: () => opts.chatInput ?? true,
    inCachedGuild: () => opts.inGuild ?? true,
    options: {
      getSubcommand: (req = true) => {
        if (opts.subcommand == null && req) {
          throw new Error('No subcommand');
        }
        return opts.subcommand ?? null;
      },
      getSubcommandGroup: (req = true) => {
        if (opts.group == null && req) {
          throw new Error('No subcommand group');
        }
        return opts.group ?? null;
      },
      getChannel: required,
      getBoolean: required,
      getString: required,
      getUser: required,
      getRole: required,
      getNumber: required,
      getInteger: required,
      getAttachment: required,
    },
    reply: async (payload: SentPayload) => {
      calls.push({ method: 'reply', payload });
      state.replied = true;
    },
    deferReply: async (payload: SentPayload) => {
      calls.push({ method: 'deferReply', payload });
      state.deferred = true;
    },
    editReply: async (payload: SentPayload) => {
      calls.push({ method: 'editReply', payload });
      state.replied = true;
    },
    followUp: async (payload: SentPayload) => {
      calls.push({ method: 'followUp', payload });
    },
  };

  return { interaction: stub<ChatInputCommandInteraction<'cached'>>(state), calls };
}
