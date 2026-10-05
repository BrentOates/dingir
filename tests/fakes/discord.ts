import { Collection, User } from 'discord.js';
import type { Client, Guild, GuildMember } from 'discord.js';
import type { DingirClient } from '../../src/client/DingirClient.ts';
import type { ServerConfig } from '../../src/db/schema.ts';

/** The one place tests cast structural stubs to discord.js types. */
export const stub = <T>(partial: object): T => partial as unknown as T;

export const apiError = (code: number): Error =>
  Object.assign(new Error(`Discord error ${code}`), { code });

export function fakeUser(id: string, overrides: Record<string, unknown> = {}): User {
  return Object.assign(Object.create(User.prototype), {
    id,
    bot: false,
    username: `user${id}`,
    globalName: null,
    discriminator: '0',
    displayAvatarURL: () => 'https://example.com/a.png',
    toString: () => `<@${id}>`,
    ...overrides,
  }) as User;
}

export function fakeMember(id: string, overrides: Record<string, unknown> = {}): GuildMember {
  const user = (overrides.user as User | undefined) ?? fakeUser(id);
  return stub<GuildMember>({
    id,
    user,
    displayName: `Member ${id}`,
    joinedTimestamp: Date.now(),
    permissions: { has: () => false },
    roles: { cache: new Collection<string, unknown>([['everyone', {}]]) },
    bannable: true,
    ban: async () => undefined,
    displayAvatarURL: () => 'https://example.com/a.png',
    toString: () => `<@${id}>`,
    ...overrides,
  });
}

export interface FakeGuildOverrides extends Record<string, unknown> {
  /** Convenience: channels that exist in the guild cache and can be fetched. */
  channelIds?: string[];
}

export function fakeGuild(overrides: FakeGuildOverrides = {}): Guild {
  const { channelIds = [], ...rest } = overrides;
  const cache = new Collection<string, { id: string }>(channelIds.map((id) => [id, { id }]));
  return stub<Guild>({
    id: 'guild-1',
    name: 'Test Guild',
    channels: {
      cache,
      fetch: async (id: string) => {
        const channel = cache.get(id);
        if (!channel) {
          throw new Error('Unknown Channel');
        }
        return channel;
      },
    },
    ...rest,
  });
}

export function fakeConfig(overrides: Partial<Record<keyof ServerConfig, unknown>> = {}): ServerConfig {
  return stub<ServerConfig>({
    serverId: 'guild-1',
    guestRoleIds: null,
    welcomeMessage: null,
    welcomeMessageBackgroundUrl: null,
    systemMessagesEnabled: false,
    debug: false,
    auditChannelId: null,
    ...overrides,
  });
}

export interface EmbedJson {
  title?: string;
  description?: string;
  author?: { name: string };
  fields: { name: string; value: string; inline?: boolean }[];
  [key: string]: unknown;
}

/** A message payload as captured from send/edit/reply calls. */
export interface SentPayload {
  content?: string;
  embeds?: { toJSON(): EmbedJson }[];
  files?: { attachment: Buffer | string }[];
  [key: string]: unknown;
}

export interface AuditChannel {
  channel: { isSendable(): boolean; send(payload: unknown): Promise<void> };
  sent: SentPayload[];
}

/** A sendable channel that records payloads, or rejects every send when `failWith` is given. */
export function fakeAuditChannel(failWith?: string): AuditChannel {
  const sent: SentPayload[] = [];
  return {
    sent,
    channel: {
      isSendable: () => true,
      send: async (payload) => {
        if (failWith) {
          throw new Error(failWith);
        }
        sent.push(payload as SentPayload);
      },
    },
  };
}

/** A client whose channel cache resolves only `channelId` (to `channel`). */
export function fakeChannelClient(channelId: string, channel: object, extra: object = {}): DingirClient {
  return stub<DingirClient & Client>({
    channels: { fetch: async (id: string) => (id === channelId ? channel : null) },
    ...extra,
  });
}
