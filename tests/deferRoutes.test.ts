import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commands } from '../src/commands/index.ts';
import { fakeInteraction } from './fakes/interaction.ts';

const defers = (
  command: string,
  group: string | null,
  subcommand: string | null,
): string | false | undefined => {
  const cmd = commands.find((c) => c.name === command)!;
  const { interaction } = fakeInteraction({ commandName: command, group, subcommand });
  return cmd.resolve(interaction)?.defer;
};

test('routes that await Discord network calls before replying defer ephemerally', () => {
  const routes: [string, string | null, string | null][] = [
    ['profile', null, null],
    ['config', 'newroles', 'set'],
    ['config', 'newroles', 'clear'],
    ['config', 'audit', 'get'],
    ['config', 'announcements', 'get'],
    ['config', 'honeypot', 'get'],
    ['config', 'welcome', 'set-image'],
    ['config', 'welcome', 'preview'],
    ['config', 'birthdays', 'create'],
    ['config', 'birthdays', 'sync'],
    ['config', 'birthdays', 'remove'],
    ['noroles', null, null],
    ['rolesince', null, null],
    ['post', null, null],
    ['simulate', null, 'join'],
    ['simulate', null, 'onboard'],
  ];
  for (const [command, group, sub] of routes) {
    assert.equal(defers(command, group, sub), 'ephemeral', [command, group, sub].join(' '));
  }
});
