import { Collection } from 'discord.js';
import type { App } from '../../src/app.ts';
import type { DingirClient } from '../../src/client/DingirClient.ts';
import type { Command } from '../../src/framework/command.ts';
import interactionCreate from '../../src/events/interactionCreate.ts';
import { fakeAuditChannel, fakeChannelClient, fakeGuild, fakeMember, fakeUser } from './discord.ts';
import type { FakeInteraction } from './interaction.ts';

export { fakeMember, fakeUser };

export interface AuditSink {
  client: DingirClient;
  sent: any[];
}

export function fakeAuditClient(channelId = 'audit-1', commands: Command[] = []): AuditSink {
  const { channel, sent } = fakeAuditChannel();
  const slashCommands = new Collection(commands.map((c) => [c.name, c]));
  return { client: fakeChannelClient(channelId, channel, { slashCommands }), sent };
}

export const auditJson = (sent: any[], index = 0): any => sent[index].embeds[0].toJSON();

export function fakeMessage(overrides: Record<string, unknown> = {}) {
  const author = (overrides.author as ReturnType<typeof fakeUser> | null | undefined) ?? fakeUser('u1');
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
    guild: fakeGuild({ members: { fetch: async () => null } }),
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
