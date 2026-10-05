import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Guild } from 'discord.js';
import { apiError, fakeMember, stub } from '../fakes/discord.ts';
import { resolveMember, resolveTextChannel } from '../../src/services/MemberResolver.ts';

const guildWith = (cached: Record<string, unknown>, fetch: (id: string) => Promise<unknown>): Guild =>
  stub<Guild>({
    members: { cache: new Map(Object.entries(cached)), fetch },
    channels: { cache: new Map(Object.entries(cached)), fetch },
  });

test('cache hit does not fetch', async () => {
  const member = fakeMember('u1');
  const guild = guildWith({ u1: member }, async () => {
    throw new Error('should not fetch');
  });
  assert.equal(await resolveMember(guild, 'u1'), member);
  assert.equal(await resolveMember(guild, { id: 'u1' } as never), member);
});

test('cache miss fetches', async () => {
  const member = fakeMember('u2');
  const guild = guildWith({}, async () => member);
  assert.equal(await resolveMember(guild, 'u2'), member);
});

test('Unknown Member and Unknown User resolve to null', async () => {
  for (const code of [10007, 10013]) {
    const guild = guildWith({}, async () => {
      throw apiError(code);
    });
    assert.equal(await resolveMember(guild, 'u3'), null);
  }
});

test('other errors are rethrown', async () => {
  const guild = guildWith({}, async () => {
    throw apiError(50013);
  });
  await assert.rejects(resolveMember(guild, 'u3'), { code: 50013 });
});

test('resolveTextChannel returns sendable guild text channels only', async () => {
  const good = { isTextBased: () => true, isDMBased: () => false, isSendable: () => true };
  const voice = { isTextBased: () => false, isDMBased: () => false, isSendable: () => false };
  const guild = guildWith({ good, voice }, async () => {
    throw apiError(10003);
  });
  assert.equal(await resolveTextChannel(guild, 'good'), good as never);
  assert.equal(await resolveTextChannel(guild, 'voice'), null);
  assert.equal(await resolveTextChannel(guild, 'missing'), null);
});
