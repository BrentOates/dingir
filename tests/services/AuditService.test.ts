import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Client} from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import type { ServerConfig } from '../../src/db/schema.ts';
import { sendAudit } from '../../src/services/AuditService.ts';
import { fakeConfig, stub } from '../fakes/discord.ts';
import { createTestApp } from '../helpers/app.ts';

const app = createTestApp();

const config = (auditChannelId: string | null): ServerConfig =>
  fakeConfig({ serverId: 'g1', auditChannelId });
const clientWith = (fetch: () => Promise<unknown>): Client => stub<Client>({ channels: { fetch } });
const embed = new EmbedBuilder().setDescription('x');

test('returns false without fetching when no audit channel configured', async () => {
  let fetched = false;
  const client = clientWith(async () => {
    fetched = true;
    return null;
  });
  assert.equal(await sendAudit(app, client, config(null), embed), false);
  assert.equal(fetched, false);
});

test('returns false when fetch rejects', async () => {
  const client = clientWith(async () => {
    throw new Error('Missing Access');
  });
  assert.equal(await sendAudit(app, client, config('c1'), embed), false);
});

test('returns false when channel is missing or not sendable', async () => {
  assert.equal(await sendAudit(app, clientWith(async () => null), config('c1'), embed), false);
  const unsendable = clientWith(async () => ({ isSendable: () => false }));
  assert.equal(await sendAudit(app, unsendable, config('c1'), embed), false);
});

test('returns false when send rejects', async () => {
  const client = clientWith(async () => ({
    isSendable: () => true,
    send: async () => {
      throw new Error('Missing Permissions');
    },
  }));
  assert.equal(await sendAudit(app, client, config('c1'), embed), false);
});

test('sends embed and files, returns true', async () => {
  const sent: unknown[] = [];
  const client = clientWith(async () => ({
    isSendable: () => true,
    send: async (payload: unknown) => void sent.push(payload),
  }));
  assert.equal(await sendAudit(app, client, config('c1'), embed), true);
  assert.deepEqual(sent, [{ embeds: [embed], files: undefined }]);
});
