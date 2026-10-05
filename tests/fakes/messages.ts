import { Collection, User } from 'discord.js';
import type { App } from '../../src/app.ts';
import type { DingirClient } from '../../src/client/DingirClient.ts';
import type { Command } from '../../src/framework/command.ts';
import interactionCreate from '../../src/events/interactionCreate.ts';
import type { FakeInteraction } from './interaction.ts';

export interface AuditSink {
  client: DingirClient;
  sent: any[];
}

export function fakeAuditClient(channelId = 'audit-1', commands: Command[] = []): AuditSink {
  const sent: any[] = [];
  const channel = {
    isSendable: () => true,
    send: async (payload: unknown) => void sent.push(payload),
  };
  const client = {
    channels: { fetch: async (id: string) => (id === channelId ? channel : null) },
    slashCommands: new Collection(commands.map((c) => [c.name, c])),
  } as unknown as DingirClient;
  return { client, sent };
}

export const auditJson = (sent: any[], index = 0): any => sent[index].embeds[0].toJSON();

export function fakeUser(id: string, overrides: Record<string, unknown> = {}) {
  return Object.assign(Object.create(User.prototype), {
    id,
    bot: false,
    username: `user${id}`,
    globalName: null,
    discriminator: '0',
    displayAvatarURL: () => 'https://example.com/a.png',
    ...overrides,
  }) as User;
}

export function fakeMember(id: string, overrides: Record<string, unknown> = {}) {
  const user = (overrides.user as User) ?? fakeUser(id);
  return {
    id,
    user,
    displayName: `Member ${id}`,
    joinedTimestamp: Date.now(),
    permissions: { has: () => false },
    roles: { cache: new Collection<string, unknown>([['everyone', {}]]) },
    bannable: true,
    ban: async () => undefined,
    displayAvatarURL: () => 'https://example.com/a.png',
    ...overrides,
  };
}

export function fakeMessage(overrides: Record<string, unknown> = {}) {
  const author = (overrides.author as User | null | undefined) ?? fakeUser('u1');
  const base = {
    id: 'm1',
    partial: false,
    guildId: 'guild-1',
    channelId: 'chan-1',
    webhookId: null,
    system: false,
    content: 'hello',
    author,
    member: fakeMember(author.id, { user: author }),
    guild: { id: 'guild-1', members: { fetch: async () => null } },
    attachments: new Collection<string, { name: string }>(),
    embeds: [] as unknown[],
    url: 'https://discord.com/channels/guild-1/chan-1/m1',
    inGuild() {
      return Boolean(this.guildId);
    },
  };
  return { ...base, ...overrides } as any;
}

export async function runSlash(
  app: App,
  client: DingirClient,
  fake: FakeInteraction,
  extra: Record<string, unknown> = {}
): Promise<void> {
  Object.assign(fake.interaction, { client, ...extra });
  await interactionCreate.run(app, client, fake.interaction);
}
