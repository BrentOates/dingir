import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { loadCommands, loadEvents } from '../src/framework/loader';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dingir-loader-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const write = async (relative: string, contents: string) => {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents);
  return file;
};

const commandModule = (name: string) =>
  `exports.__esModule = true;\nexports.default = { name: ${JSON.stringify(name)}, toJSON() { return {}; }, resolve() {} };\n`;
const eventModule = (name: string) =>
  `exports.__esModule = true;\nexports.default = { name: ${JSON.stringify(name)}, run: async () => {} };\n`;

test('loadCommands reads the top level of each category and skips Subcommands, .d.ts and maps', async () => {
  await write('Info/ping.js', commandModule('ping'));
  await write('Info/about.js', commandModule('about'));
  await write('Info/ping.js.map', '{}');
  await write('Info/types.d.ts', 'export {};');
  await write('Info/Subcommands/ignored.js', 'throw new Error("must not load");');
  await write('Config/Subcommands/nested.js', 'throw new Error("must not load");');
  await write('Config/config.js', commandModule('config'));
  await write('Admin/deep/ignored.js', 'throw new Error("must not load");');

  const commands = await loadCommands(root);
  assert.deepEqual(commands.map((c) => c.name).sort(), ['about', 'config', 'ping']);
});

test('loadCommands rejects duplicate command names, naming both files', async () => {
  const first = await write('A/one.js', commandModule('same'));
  const second = await write('B/two.js', commandModule('same'));
  await assert.rejects(loadCommands(root), (err: Error) => {
    assert.ok(err.message.includes('Duplicate command "same"'));
    assert.ok(err.message.includes(second));
    assert.ok(err.message.includes(first));
    return true;
  });
});

test('loadCommands rejects modules without a valid default export', async () => {
  const file = await write('A/bad.js', 'exports.default = { name: "bad" };');
  await assert.rejects(loadCommands(root), (err: Error) => {
    assert.ok(err.message.includes(file));
    assert.match(err.message, /export default a Command/);
    return true;
  });
});

test('loadCommands rejects legacy named exports', async () => {
  const file = await write('A/legacy.js', 'exports.commandData = {}; exports.execute = () => {};');
  await assert.rejects(loadCommands(root), (err: Error) => err.message.includes(file));
});

test('loadCommands reports files that fail to import with their path', async () => {
  const file = await write('A/broken.js', 'throw new Error("syntax boom");');
  await assert.rejects(loadCommands(root), (err: Error) => {
    assert.ok(err.message.includes(file));
    assert.ok(err.message.includes('syntax boom'));
    return true;
  });
});

test('loadEvents loads top-level event modules', async () => {
  await write('ready.js', eventModule('clientReady'));
  await write('messageCreate.js', eventModule('messageCreate'));
  await write('helpers/ignored.js', 'throw new Error("must not load");');
  await write('messageCreate.d.ts', '');

  const events = await loadEvents(root);
  assert.deepEqual(events.map((e) => e.name).sort(), ['clientReady', 'messageCreate']);
});

test('loadEvents rejects duplicates and bad shapes', async () => {
  await write('a.js', eventModule('messageCreate'));
  await write('b.js', eventModule('messageCreate'));
  await assert.rejects(loadEvents(root), /Duplicate event "messageCreate"/);

  await fs.rm(path.join(root, 'b.js'));
  const bad = await write('c.js', 'exports.default = { name: "x", run: 5 };');
  await assert.rejects(loadEvents(root), (err: Error) => err.message.includes(bad));
});
