import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeMember, stub } from '../fakes/discord.ts';
import { AuditEmbed, memberAuditEmbed } from '../../src/services/AuditEmbed.ts';
import { EmbedColours } from '../../src/resources/EmbedColours.ts';
import { nth } from '../helpers/assertions.ts';

const total = (json: ReturnType<AuditEmbed['toJSON']>): number =>
  (json.title?.length ?? 0) +
  (json.description?.length ?? 0) +
  (json.author?.name.length ?? 0) +
  (json.footer?.text.length ?? 0) +
  (json.fields ?? []).reduce((s, f) => s + f.name.length + f.value.length, 0);

test('short fields pass through untouched', () => {
  const json = new AuditEmbed().addField('Name', 'Value', true).toJSON();
  assert.deepEqual(json.fields, [{ name: 'Name', value: 'Value', inline: true }]);
});

test('1025-char value is truncated to 1024 with ellipsis and a note', () => {
  const json = new AuditEmbed().addField('Big', 'x'.repeat(1025)).toJSON();
  const field = nth(json.fields);
  const note = nth(json.fields, 1);
  assert.equal(field.value.length, 1024);
  assert.ok(field.value.endsWith('…'));
  assert.equal(note.name, 'Truncated');
});

test('empty and whitespace values render as *(empty)*', () => {
  const json = new AuditEmbed().addField('A', '').addField('B', '   ').toJSON();
  assert.deepEqual(
    json.fields?.map((f) => f.value),
    ['*(empty)*', '*(empty)*']
  );
  assert.equal(json.fields?.length, 2);
});

test('long names truncate to 256', () => {
  const json = new AuditEmbed().addField('n'.repeat(300), 'v').toJSON();
  assert.equal(nth(json.fields).name.length, 256);
});

test('30 fields are capped at 25 including the truncation note', () => {
  const embed = new AuditEmbed();
  for (let i = 0; i < 30; i += 1) {
    embed.addField(`f${i}`, 'v');
  }
  const json = embed.toJSON();
  assert.equal(json.fields?.length, 25);
  assert.equal(nth(json.fields, 24).name, 'Truncated');
  assert.equal(nth(json.fields, 23).name, 'f23');
});

test('exactly 25 fields need no note', () => {
  const embed = new AuditEmbed();
  for (let i = 0; i < 25; i += 1) {
    embed.addField(`f${i}`, 'v');
  }
  const json = embed.toJSON();
  assert.equal(json.fields?.length, 25);
  assert.notEqual(nth(json.fields, 24).name, 'Truncated');
});

test('description over 4096 is truncated', () => {
  const json = new AuditEmbed().setDescription('d'.repeat(5000)).toJSON();
  assert.equal(json.description?.length, 4096);
  assert.equal(json.fields?.at(-1)?.name, 'Truncated');
});

test('7000 total chars are trimmed to 6000 or less, dropping trailing fields', () => {
  const embed = new AuditEmbed().setDescription('d'.repeat(1000));
  for (let i = 0; i < 7; i += 1) {
    embed.addField(`f${i}`, 'v'.repeat(1000));
  }
  const json = embed.toJSON();
  assert.ok(total(json) <= 6000, `total was ${total(json)}`);
  assert.equal(json.fields?.at(-1)?.name, 'Truncated');
  assert.equal(nth(json.fields).name, 'f0');
  assert.ok((json.fields?.length ?? 0) < 8);
});

test('oversized description plus fields still fits', () => {
  const embed = new AuditEmbed().setDescription('d'.repeat(4096));
  embed.addField('a', 'v'.repeat(1024)).addField('b', 'v'.repeat(1024)).addField('c', 'v'.repeat(1024));
  assert.ok(total(embed.toJSON()) <= 6000);
});

test('toJSON does not mutate the builder', () => {
  const embed = new AuditEmbed();
  for (let i = 0; i < 8; i += 1) {
    embed.addField(`f${i}`, 'v'.repeat(1000));
  }
  embed.toJSON();
  assert.equal(embed.data.fields?.length, 8);
});

test('memberAuditEmbed sets author, colour, description and timestamp', () => {
  const member = fakeMember('1', {
    displayName: 'Alice',
    user: stub({ tag: 'alice#0' }),
    displayAvatarURL: () => 'https://cdn.example/a.png',
  });
  const json = memberAuditEmbed(member, EmbedColours.info, 'hello').toJSON();
  assert.equal(json.author?.name, 'Alice');
  assert.equal(json.author?.icon_url, 'https://cdn.example/a.png');
  assert.equal(json.description, 'hello');
  assert.ok(json.timestamp);
  assert.equal(typeof json.color, 'number');
});
