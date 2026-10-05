import { Collection } from 'discord.js';
import type { Client } from 'discord.js';
import { apiError, fakeMember, stub, type SentPayload } from './discord.ts';

export { apiError };

export interface FakeEditableMessage {
  id: string;
  edits: SentPayload[];
  deleted: boolean;
  edit(payload: unknown): Promise<FakeEditableMessage>;
  delete(): Promise<void>;
}

export const fakeEditableMessage = (id: string): FakeEditableMessage => {
  const message: FakeEditableMessage = {
    id,
    edits: [],
    deleted: false,
    edit: async (payload) => {
      message.edits.push(payload as SentPayload);
      return message;
    },
    delete: async () => {
      message.deleted = true;
    },
  };
  return message;
};

export interface FakeChannel {
  id: string;
  sent: SentPayload[];
  messages: { fetch(id: string): Promise<FakeEditableMessage> };
  isTextBased(): boolean;
  isDMBased(): boolean;
  isSendable(): boolean;
  send(payload: unknown): Promise<{ id: string; channelId: string }>;
}

export const fakeTextChannel = (id: string, messages: FakeEditableMessage[] = []): FakeChannel => {
  const channel: FakeChannel = {
    id,
    sent: [],
    messages: {
      fetch: async (messageId) => {
        const found = messages.find((m) => m.id === messageId);
        if (!found) {
          throw apiError(10008);
        }
        return found;
      },
    },
    isTextBased: () => true,
    isDMBased: () => false,
    isSendable: () => true,
    send: async (payload) => {
      channel.sent.push(payload as SentPayload);
      return { id: `sent-${channel.sent.length}`, channelId: id };
    },
  };
  return channel;
};

export interface FakeGuildOptions {
  id: string;
  memberIds?: string[];
  channels?: FakeChannel[];
  membersFetchError?: Error;
}

export const fakeGuildWithMembers = (opts: FakeGuildOptions) => {
  const members = new Collection(
    (opts.memberIds ?? []).map((id) => [id, fakeMember(id)])
  );
  const channels = new Collection<string, FakeChannel>((opts.channels ?? []).map((c) => [c.id, c]));
  return {
    id: opts.id,
    name: `Guild ${opts.id}`,
    members: {
      cache: members,
      fetch: async (id?: string) => {
        if (opts.membersFetchError) {
          throw opts.membersFetchError;
        }
        if (id === undefined) {
          return members;
        }
        const found = members.get(id);
        if (!found) {
          throw apiError(10007);
        }
        return found;
      },
    },
    channels: { cache: channels, fetch: async (id: string) => channels.get(id) ?? null },
  };
};

export type FakeGuildWithMembers = ReturnType<typeof fakeGuildWithMembers>;

export interface FakeClientOptions {
  guilds?: Record<string, FakeGuildWithMembers | Error>;
  channels?: FakeChannel[];
  channelFetchError?: Error;
}

export const fakeClient = (opts: FakeClientOptions = {}): Client => {
  const guilds = opts.guilds ?? {};
  const channels = opts.channels ?? [];
  const cache = new Collection<string, FakeGuildWithMembers>();
  for (const [id, value] of Object.entries(guilds)) {
    if (!(value instanceof Error)) {
      cache.set(id, value);
    }
  }
  return stub<Client>({
    guilds: {
      cache,
      fetch: async (id: string) => {
        const value = guilds[id];
        if (value === undefined) {
          throw apiError(10004);
        }
        if (value instanceof Error) {
          throw value;
        }
        return value;
      },
    },
    channels: {
      fetch: async (id: string) => {
        if (opts.channelFetchError) {
          throw opts.channelFetchError;
        }
        return channels.find((c) => c.id === id) ?? null;
      },
    },
  });
};
