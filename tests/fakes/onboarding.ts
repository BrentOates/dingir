import type { Client, Guild, GuildMember } from 'discord.js';
import type { ServerConfig } from '../../src/db/schema.ts';
import {
  fakeAuditChannel,
  fakeConfig,
  fakeGuild,
  fakeMember,
  type SentPayload,
  stub,
} from './discord.ts';

export { fakeCommandContext } from './command.ts';

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
  const systemSends: SentPayload[] = [];

  const roles = new Map((opts.roles ?? []).map((r) => [r.id, r]));
  const guild: Guild = fakeGuild({
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
              systemSends.push(payload as SentPayload);
            },
          },
  });

  const member: GuildMember = fakeMember('member-1', {
    displayName: 'Member',
    user: stub({ id: 'member-1', tag: 'member#0001' }),
    guild,
    roles: {
      add: async (ids: string[]) => {
        if (opts.failRolesAdd) {
          throw new Error('missing permissions');
        }
        roleAdds.push(ids);
      },
    },
  });

  const { channel, sent: auditSends } = fakeAuditChannel(
    opts.failAuditSend ? 'audit down' : undefined,
  );
  const client = stub<Client>({ channels: { fetch: async () => channel } });

  const config = fakeConfig({
    auditChannelId: opts.auditChannel === false ? null : 'audit-1',
    ...opts.config,
  });

  return { client, member, guild, config, roleAdds, systemSends, auditSends };
}
