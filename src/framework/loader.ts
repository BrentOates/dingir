import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Command } from './command';
import type { EventDefinition } from './event';

const isModuleFile = (name: string): boolean =>
  (name.endsWith('.js') || name.endsWith('.ts')) && !name.endsWith('.d.ts');

async function listModules(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isModuleFile(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

async function importDefault(file: string): Promise<unknown> {
  let mod: any;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (error) {
    throw new Error(`Failed to load ${file}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  // CommonJS output surfaces as { default: module.exports }, so unwrap the __esModule layer
  let value = mod?.default ?? mod;
  if (value?.__esModule && 'default' in value) {
    value = value.default;
  }
  return value;
}

const isCommand = (value: any): value is Command =>
  typeof value?.name === 'string' &&
  typeof value.toJSON === 'function' &&
  typeof value.resolve === 'function';

const isEvent = (value: any): value is EventDefinition<any> =>
  typeof value?.name === 'string' &&
  typeof value.run === 'function' &&
  (value.once === undefined || typeof value.once === 'boolean');

/** Loads `<root>/<Category>/*.js`, skipping `Subcommands` directories and nested dirs. */
export async function loadCommands(root: string): Promise<Command[]> {
  const categories = (await fs.readdir(root, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && entry.name !== 'Subcommands'
  );

  const commands: Command[] = [];
  const seen = new Map<string, string>();
  for (const category of categories.sort((a, b) => a.name.localeCompare(b.name))) {
    for (const file of await listModules(path.join(root, category.name))) {
      const value = await importDefault(file);
      if (!isCommand(value)) {
        throw new Error(`${file} must export default a Command created with defineCommand`);
      }
      const existing = seen.get(value.name);
      if (existing) {
        throw new Error(`Duplicate command "${value.name}" in ${file} (already defined in ${existing})`);
      }
      seen.set(value.name, file);
      commands.push(value);
    }
  }
  return commands;
}

/** Loads every top-level module in `dir` as an event definition. */
export async function loadEvents(dir: string): Promise<EventDefinition<any>[]> {
  const events: EventDefinition<any>[] = [];
  const seen = new Map<string, string>();
  for (const file of await listModules(dir)) {
    const value = await importDefault(file);
    if (!isEvent(value)) {
      throw new Error(`${file} must export default an event created with defineEvent`);
    }
    const existing = seen.get(value.name);
    if (existing) {
      throw new Error(`Duplicate event "${value.name}" in ${file} (already defined in ${existing})`);
    }
    seen.set(value.name, file);
    events.push(value);
  }
  return events;
}
