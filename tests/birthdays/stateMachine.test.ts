import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { PermissionFlagsBits, type Client, type Guild, type GuildMember } from 'discord.js';
import BirthdaysGroup from '../../src/commands/config/groups/birthdays.ts';
import guildMemberRemove from '../../src/events/guildMemberRemove.ts';
import type { DingirClient } from '../../src/client/DingirClient.ts';
import type { Handler } from '../../src/framework/command.ts';
import {
  deleteCalendarMessage,
  refreshAllCalendars,
  refreshCalendar,
  type CalendarStatus,
} from '../../src/services/BirthdayService.ts';
import { fakeCommandContext } from '../fakes/command.ts';
import { fakeAuditChannel, fakeMember, stub, type SentPayload } from '../fakes/discord.ts';
import {
  apiError,
  fakeClient,
  fakeEditableMessage,
  fakeTextChannel,
  type FakeChannel,
} from '../fakes/guild.ts';
import { createTestApp } from '../helpers/app.ts';
import { contentOf, last, nth } from '../helpers/assertions.ts';
import { dbFixtures } from '../helpers/db.ts';

const app = createTestApp();
const { clearConfigs, clearProfiles, createConfig, createProfiles, findConfig } = dbFixtures(app);

after(() => {
  app.close();
});

beforeEach(() => {
  clearConfigs();
  clearProfiles();
});

const sub = (name: string): Handler => BirthdaysGroup.subcommands.find((s) => s.name === name)!.run;
const create = sub('create');
const remove = sub('remove');
const pathOf = (): string | null | undefined => findConfig('guild-1')?.birthdayCalendarMessagePath;
const network = Object.assign(new Error('network'), { code: 500 });

// ---------------------------------------------------------------------------------------------
// refresh: stored path x failure -> status; the stored path is never changed by a refresh.
// ---------------------------------------------------------------------------------------------

interface RefreshRow {
  name: string;
  path: string | null;
  channel?: 'ok' | 'unknown-channel' | Error | 'not-text';
  message?: 'ok' | Error;
  edit?: Error;
  status: CalendarStatus;
}

const refreshRows: RefreshRow[] = [
  { name: 'no path', path: null, status: 'not-configured' },
  { name: 'malformed path', path: 'garbage', status: 'not-configured' },
  { name: 'all fine', path: 'c1/m1', status: 'updated' },
  {
    name: 'channel not found',
    path: 'c1/m1',
    channel: 'unknown-channel',
    status: 'channel-missing',
  },
  {
    name: 'channel is not text based',
    path: 'c1/m1',
    channel: 'not-text',
    status: 'channel-missing',
  },
  {
    name: 'channel fetch: Unknown Channel',
    path: 'c1/m1',
    channel: apiError(10003),
    status: 'channel-missing',
  },
  {
    name: 'channel fetch: Missing Access',
    path: 'c1/m1',
    channel: apiError(50001),
    status: 'no-access',
  },
  {
    name: 'channel fetch: network error is transient',
    path: 'c1/m1',
    channel: network,
    status: 'failed',
  },
  {
    name: 'message fetch: Unknown Message',
    path: 'c1/m1',
    message: apiError(10008),
    status: 'message-missing',
  },
  {
    name: 'message fetch: Missing Permissions',
    path: 'c1/m1',
    message: apiError(50013),
    status: 'no-access',
  },
  {
    name: 'message fetch: network error is transient',
    path: 'c1/m1',
    message: network,
    status: 'failed',
  },
  {
    name: 'edit: message deleted meanwhile',
    path: 'c1/m1',
    edit: apiError(10008),
    status: 'message-missing',
  },
  { name: 'edit: cannot edit', path: 'c1/m1', edit: apiError(50005), status: 'no-access' },
  { name: 'edit: network error is transient', path: 'c1/m1', edit: network, status: 'failed' },
];

describe('birthday calendar refresh', () => {
  for (const row of refreshRows) {
    test(row.name, async () => {
      const config = createConfig({ serverId: 'guild-1', birthdayCalendarMessagePath: row.path });
      const message = fakeEditableMessage('m1');
      if (row.edit) {
        message.edit = async () => {
          throw row.edit;
        };
      }
      const channel = fakeTextChannel('c1', [message]);
      if (row.message instanceof Error) {
        channel.messages.fetch = async () => {
          throw row.message as Error;
        };
      }
      if (row.channel === 'not-text') {
        channel.isTextBased = () => false;
      }
      const client = fakeClient({
        channels: row.channel === 'unknown-channel' ? [] : [channel],
        ...(row.channel instanceof Error ? { channelFetchError: row.channel } : {}),
      });
      assert.equal(await refreshCalendar(app, client, config), row.status);
      assert.equal(pathOf(), row.path, 'a refresh never changes the stored path');
      assert.equal(message.edits.length, row.status === 'updated' ? 1 : 0);
    });
  }

  test('concurrent refreshes run in order, so the last edit has the latest profiles', async () => {
    const config = createConfig({ serverId: 'guild-1', birthdayCalendarMessagePath: 'c1/m1' });
    createProfiles([{ serverId: 'guild-1', userId: 'alice', birthdayMonth: 3, birthdayDay: 4 }]);
    const message = fakeEditableMessage('m1');
    const firstEdit = Promise.withResolvers<void>();
    const record = (payload: unknown) => {
      message.edits.push(payload as SentPayload);
      return Promise.resolve(message);
    };
    let calls = 0;
    message.edit = async (payload) => {
      if (calls++ === 0) {
        await firstEdit.promise;
      }
      return record(payload);
    };
    const client = fakeClient({ channels: [fakeTextChannel('c1', [message])] });
    const first = refreshCalendar(app, client, config);
    await new Promise((resolve) => setImmediate(resolve));
    createProfiles([{ serverId: 'guild-1', userId: 'bob', birthdayMonth: 3, birthdayDay: 5 }]);
    const second = refreshCalendar(app, client, config);
    await new Promise((resolve) => setImmediate(resolve));
    firstEdit.resolve();
    await Promise.all([first, second]);
    assert.match(contentOf(last(message.edits)), /<@alice>/);
    assert.match(contentOf(last(message.edits)), /<@bob>/);
  });

  test('a failed refresh does not block the next one', async () => {
    const config = createConfig({ serverId: 'guild-1', birthdayCalendarMessagePath: 'c1/m1' });
    const bad = fakeClient({ channelFetchError: network });
    const good = fakeClient({ channels: [fakeTextChannel('c1', [fakeEditableMessage('m1')])] });
    assert.equal(await refreshCalendar(app, bad, config), 'failed');
    assert.equal(await refreshCalendar(app, good, config), 'updated');
  });

  test('the scheduled refresh skips a config purged since it was listed', async () => {
    createConfig({ serverId: 'guild-1', birthdayCalendarMessagePath: 'c1/m1' });
    const message = fakeEditableMessage('m1');
    const channel = fakeTextChannel('c1', [message]);
    const client = fakeClient({ channels: [channel] });
    const fetch = client.channels.fetch.bind(client.channels);
    client.channels.fetch = (async (id: string) => {
      clearConfigs(); // guildDelete lands while the job is running
      return fetch(id);
    }) as typeof client.channels.fetch;
    await refreshAllCalendars(app, client);
    assert.equal(findConfig('guild-1'), null, 'no config row is recreated');
  });
});

// ---------------------------------------------------------------------------------------------
// create / remove: previous path x injected failure -> stored path + message side effects.
// ---------------------------------------------------------------------------------------------

interface CommandRow {
  name: string;
  command: 'create' | 'remove';
  previous: boolean;
  failSend?: boolean;
  failPersist?: boolean;
  failPopulate?: boolean;
  noReadHistory?: boolean;
  oldChannel?: 'normal' | 'gone' | 'throws';
  oldMessage?: 'normal' | Error;
  /** Expected error message, or undefined when the command succeeds. */
  error?: RegExp;
  reply?: string | RegExp;
  path: 'old' | 'new' | null;
  oldDeleted: boolean;
  newDeleted: boolean;
}

const OLD = 'old-chan/old-msg';
const commandRows: CommandRow[] = [
  {
    name: 'create over an old calendar: new path saved, then old deleted',
    command: 'create',
    previous: true,
    reply: /created/,
    path: 'new',
    oldDeleted: true,
    newDeleted: false,
  },
  {
    name: 'create with no calendar: path saved',
    command: 'create',
    previous: false,
    reply: /created/,
    path: 'new',
    oldDeleted: false,
    newDeleted: false,
  },
  {
    name: 'create, send fails: old calendar and path intact',
    command: 'create',
    previous: true,
    failSend: true,
    error: /missing access/,
    path: 'old',
    oldDeleted: false,
    newDeleted: false,
  },
  {
    name: 'create, persisting fails: new message removed, old intact',
    command: 'create',
    previous: true,
    failPersist: true,
    error: /./,
    path: 'old',
    oldDeleted: false,
    newDeleted: true,
  },
  {
    name: 'create, populate fails over old: old path restored, new removed',
    command: 'create',
    previous: true,
    failPopulate: true,
    error: /existing calendar was kept/,
    path: 'old',
    oldDeleted: false,
    newDeleted: true,
  },
  {
    name: 'create, populate fails with no old: path cleared, new removed',
    command: 'create',
    previous: false,
    failPopulate: true,
    error: /nothing was changed/,
    path: null,
    oldDeleted: false,
    newDeleted: true,
  },
  {
    name: 'create without Read Message History: nothing sent',
    command: 'create',
    previous: true,
    noReadHistory: true,
    error: /read message history/,
    path: 'old',
    oldDeleted: false,
    newDeleted: false,
  },
  {
    name: 'create, old message cannot be deleted: new calendar still wins',
    command: 'create',
    previous: true,
    oldMessage: network,
    reply: /created/,
    path: 'new',
    oldDeleted: false,
    newDeleted: false,
  },
  {
    name: 'create, old channel gone: new calendar wins',
    command: 'create',
    previous: true,
    oldChannel: 'gone',
    reply: /created/,
    path: 'new',
    oldDeleted: false,
    newDeleted: false,
  },
  {
    name: 'remove: message deleted, path cleared',
    command: 'remove',
    previous: true,
    reply: 'Birthday calendar removed.',
    path: null,
    oldDeleted: true,
    newDeleted: false,
  },
  {
    name: 'remove, channel already gone: path cleared',
    command: 'remove',
    previous: true,
    oldChannel: 'gone',
    reply: /already gone/,
    path: null,
    oldDeleted: false,
    newDeleted: false,
  },
  {
    name: 'remove, message already gone (10008): path cleared',
    command: 'remove',
    previous: true,
    oldMessage: apiError(10008),
    reply: /already gone/,
    path: null,
    oldDeleted: false,
    newDeleted: false,
  },
  {
    name: 'remove, Missing Permissions: path kept, error',
    command: 'remove',
    previous: true,
    oldMessage: apiError(50013),
    error: /nothing was changed/,
    path: 'old',
    oldDeleted: false,
    newDeleted: false,
  },
  {
    name: 'remove, transient channel error: path kept, error',
    command: 'remove',
    previous: true,
    oldChannel: 'throws',
    error: /nothing was changed/,
    path: 'old',
    oldDeleted: false,
    newDeleted: false,
  },
  {
    name: 'remove with no calendar: error',
    command: 'remove',
    previous: false,
    error: /no birthday calendar/,
    path: null,
    oldDeleted: false,
    newDeleted: false,
  },
];

function commandEnv(
  row: Pick<CommandRow, 'previous' | 'oldChannel' | 'oldMessage'> & Partial<CommandRow>,
) {
  const order: string[] = [];
  const oldMessage = fakeEditableMessage('old-msg');
  oldMessage.delete = async () => {
    order.push(`delete-old(path=${pathOf()})`);
    oldMessage.deleted = true;
  };
  const oldChannel = fakeTextChannel('old-chan', [oldMessage]);
  if (row.oldMessage instanceof Error) {
    const error = row.oldMessage;
    oldChannel.messages.fetch = async () => {
      throw error;
    };
  }
  const newMessage = fakeEditableMessage('sent-1');
  newMessage.delete = async () => {
    order.push('delete-new');
    newMessage.deleted = true;
  };
  if (row.failPopulate) {
    newMessage.edit = async () => {
      throw new Error('edit failed');
    };
  }
  const target = fakeTextChannel('new-chan', [newMessage]);
  target.send = async () => {
    order.push('send-new');
    if (row.failSend) {
      throw new Error('missing access');
    }
    return { id: 'sent-1', channelId: 'new-chan', delete: () => newMessage.delete() };
  };
  Object.assign(target, {
    permissionsFor: () => ({
      has: (flag: bigint) =>
        !(row.noReadHistory && flag === PermissionFlagsBits.ReadMessageHistory),
    }),
  });
  const guild = stub<Guild>({
    id: 'guild-1',
    name: 'Test Guild',
    members: { me: { id: 'bot' } },
    channels: { cache: new Map([['new-chan', target]]), fetch: async () => target },
  });
  const config = createConfig({
    serverId: 'guild-1',
    birthdayCalendarMessagePath: row.previous ? OLD : null,
  });
  const client = fakeClient({
    channels: row.oldChannel === 'gone' ? [target] : [oldChannel, target],
    ...(row.oldChannel === 'throws' ? { channelFetchError: network } : {}),
  });
  const { ctx, replies } = fakeCommandContext(
    app,
    { channel: { id: 'new-chan' } },
    { guild, config, client },
  );
  return { ctx, replies, order, oldMessage, newMessage, oldChannel, target, guild, client };
}

describe('birthday calendar create and remove', () => {
  for (const row of commandRows) {
    test(row.name, async () => {
      const env = commandEnv(row);
      if (row.failPersist) {
        app.db.$client.exec('ALTER TABLE `ServerConfigs` RENAME TO `ServerConfigsX`');
      }
      try {
        const run = (row.command === 'create' ? create : remove)(env.ctx);
        if (row.error) {
          await assert.rejects(run, row.error);
        } else {
          await run;
        }
      } finally {
        if (row.failPersist) {
          app.db.$client.exec('ALTER TABLE `ServerConfigsX` RENAME TO `ServerConfigs`');
        }
      }
      const expectedPath = row.path === 'old' ? OLD : row.path === 'new' ? 'new-chan/sent-1' : null;
      assert.equal(pathOf() ?? null, expectedPath, 'stored path');
      assert.equal(env.oldMessage.deleted, row.oldDeleted, 'old message deleted');
      assert.equal(env.newMessage.deleted, row.newDeleted, 'new message deleted');
      if (row.reply !== undefined) {
        assert.match(contentOf(last(env.replies)), new RegExp(row.reply));
      } else {
        assert.equal(env.replies.length, 0);
      }
      if (row.command === 'create' && row.path === 'new' && row.oldDeleted) {
        assert.ok(
          env.order.indexOf('delete-old(path=new-chan/sent-1)') > env.order.indexOf('send-new'),
          'the old message is deleted only after the new path is saved',
        );
      }
      if (row.noReadHistory) {
        assert.deepEqual(env.order, [], 'nothing is sent without permission');
      }
    });
  }

  test('concurrent creates leave exactly one live calendar', async () => {
    const env = commandEnv({ previous: true });
    const messages = ['a', 'b'].map((id) => fakeEditableMessage(`sent-${id}`));
    const channel = fakeTextChannel('new-chan', messages);
    let sends = 0;
    channel.send = async () => {
      const message = nth(messages, sends++);
      return { id: message.id, channelId: 'new-chan', delete: () => message.delete() };
    };
    Object.assign(channel, { permissionsFor: () => ({ has: () => true }) });
    Object.assign(env.guild, { channels: { cache: new Map([['new-chan', channel]]) } });
    Object.assign(env.client, {
      channels: {
        fetch: async (id: string) =>
          id === 'new-chan' ? channel : id === 'old-chan' ? env.oldChannel : null,
      },
    });
    const second = fakeCommandContext(
      app,
      { channel: { id: 'new-chan' } },
      { guild: env.guild, config: env.ctx.config, client: env.client },
    );
    await Promise.all([create(env.ctx), create(second.ctx)]);
    assert.equal(pathOf(), 'new-chan/sent-b');
    assert.equal(env.oldMessage.deleted, true);
    assert.equal(nth(messages, 0).deleted, true, 'the replaced calendar is not orphaned');
    assert.equal(nth(messages, 1).deleted, false);
  });

  test('a create whose population fails does not clobber a calendar saved meanwhile', async () => {
    const env = commandEnv({ previous: true, failPopulate: true });
    env.newMessage.edit = async () => {
      // A concurrent create saves its own calendar while this one is populating.
      app.db.$client.exec(
        "UPDATE `ServerConfigs` SET birthdayCalendarMessagePath = 'other-chan/other-msg'",
      );
      app.configCache.clear();
      throw new Error('edit failed');
    };
    await assert.rejects(create(env.ctx), /existing calendar was kept/);
    assert.equal(pathOf(), 'other-chan/other-msg');
  });

  test('deleteCalendarMessage classifies results', async () => {
    const msg = fakeEditableMessage('m');
    const chan = fakeTextChannel('c', [msg]);
    const cases: [string, Parameters<typeof deleteCalendarMessage>[1], string | null][] = [
      ['deleted', fakeClient({ channels: [chan] }), 'c/m'],
      ['already-missing', fakeClient(), 'c/m'],
      ['already-missing', fakeClient({ channels: [chan] }), 'c/other'],
      ['already-missing', fakeClient(), null],
      ['already-missing', fakeClient({ channelFetchError: apiError(10003) }), 'c/m'],
      ['failed', fakeClient({ channelFetchError: apiError(50013) }), 'c/m'],
      ['failed', fakeClient({ channelFetchError: new Error('network') }), 'c/m'],
    ];
    for (const [status, client, path] of cases) {
      assert.equal(await deleteCalendarMessage(app, client, path), status);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// member leaves: the calendar must stop listing them.
// ---------------------------------------------------------------------------------------------

describe('member leaving and the calendar', () => {
  const leave = async (profile: Record<string, unknown> | null, failEdit = false) => {
    createConfig({
      serverId: 'guild-1',
      birthdayCalendarMessagePath: 'c1/m1',
      auditChannelId: 'audit-1',
    });
    if (profile) {
      createProfiles([{ serverId: 'guild-1', userId: 'user-1', ...profile }]);
    }
    const message = fakeEditableMessage('m1');
    if (failEdit) {
      message.edit = async () => {
        throw network;
      };
    }
    const calendar: FakeChannel = fakeTextChannel('c1', [message]);
    const audit = fakeAuditChannel();
    const client = stub<DingirClient & Client>({
      channels: { fetch: async (id: string) => (id === 'c1' ? calendar : audit.channel) },
    });
    const member = fakeMember('user-1', { guild: stub({ id: 'guild-1' }), partial: false });
    await guildMemberRemove.run(app, client, stub<GuildMember>(member));
    return { message, audit };
  };

  test('a departing member with a birthday triggers a calendar refresh', async () => {
    const { message, audit } = await leave({ birthdayMonth: 3, birthdayDay: 4 });
    assert.equal(message.edits.length, 1);
    assert.equal(audit.sent.length, 1);
  });

  test('a departing member without a birthday does not', async () => {
    const { message } = await leave({ activityScore: 3 });
    assert.equal(message.edits.length, 0);
  });

  test('a failing refresh does not stop the leave being audited', async () => {
    const { audit } = await leave({ birthdayMonth: 3, birthdayDay: 4 }, true);
    assert.equal(audit.sent.length, 1);
  });

  test('profile data is deleted whatever happens to the calendar', async () => {
    await leave({ birthdayMonth: 3, birthdayDay: 4 }, true);
    assert.equal(dbFixtures(app).findProfile('user-1'), null);
  });
});
