import type { Client, GuildMember } from 'discord.js';
import type { ServerConfig } from '../../src/client/models/ServerConfig';
import type { CommandContext } from '../../src/framework/command';
import { fakeInteraction } from './interaction';

export interface FakeRole {
  id: string;
  name: string;
  position: number;
  managed: boolean;
}

export interface FakeOnboardingOptions {
  roles?: FakeRole[];
  botPosition?: number;
  config?: Partial<Record<keyof ServerConfig, unknown>>;
  systemChannel?: boolean;
  auditChannel?: boolean;
  failRolesAdd?: boolean;
  failSystemSend?: boolean;
  failAuditSend?: boolean;
}

export const role = (id: string, position = 1, managed = false): FakeRole => ({
  id,
  name: `role-${id}`,
  position,
  managed,
});

export function fakeOnboarding(opts: FakeOnboardingOptions = {}) {
  const roleAdds: string[][] = [];
  const systemSends: any[] = [];
  const auditSends: any[] = [];

  const roles = new Map((opts.roles ?? []).map((r) => [r.id, r]));
  const guild: any = {
    id: 'guild-1',
    name: 'Test Guild',
    roles: { cache: roles, fetch: async () => null },
    members: { me: { roles: { highest: { position: opts.botPosition ?? 10 } } } },
    systemChannel:
      opts.systemChannel === false
        ? null
        : {
            send: async (payload: unknown) => {
              if (opts.failSystemSend) {
                throw new Error('cannot send');
              }
              systemSends.push(payload);
            },
          },
  };

  const member = {
    id: 'member-1',
    displayName: 'Member',
    user: { id: 'member-1', tag: 'member#0001' },
    guild,
    displayAvatarURL: () => 'https://example.com/a.png',
    toString: () => '<@member-1>',
    roles: {
      add: async (ids: string[]) => {
        if (opts.failRolesAdd) {
          throw new Error('missing permissions');
        }
        roleAdds.push(ids);
      },
    },
  } as unknown as GuildMember;

  const auditChannel = {
    isSendable: () => true,
    send: async (payload: unknown) => {
      if (opts.failAuditSend) {
        throw new Error('audit down');
      }
      auditSends.push(payload);
    },
  };
  const client = {
    channels: { fetch: async () => auditChannel },
  } as unknown as Client;

  const config = {
    serverId: 'guild-1',
    auditChannelId: opts.auditChannel === false ? null : 'audit-1',
    guestRoleIds: null,
    welcomeMessage: null,
    welcomeMessageBackgroundUrl: null,
    systemMessagesEnabled: false,
    debug: false,
    save: async () => undefined,
    ...opts.config,
  } as unknown as ServerConfig;

  return { client, member, guild, config, roleAdds, systemSends, auditSends };
}

export function fakeCommandContext(
  options: Record<string, unknown>,
  env: ReturnType<typeof fakeOnboarding>
) {
  const { interaction } = fakeInteraction({ options });
  (interaction as any).client = env.client;
  const replies: any[] = [];
  const ctx = {
    interaction,
    guild: env.guild,
    member: env.member,
    config: env.config,
    reply: async (response: unknown) => {
      replies.push(typeof response === 'string' ? { content: response } : response);
    },
  } as unknown as CommandContext;
  return { ctx, replies };
}
