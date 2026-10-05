import { createHash } from 'node:crypto';
import { REST, Routes } from 'discord.js';
import type { App } from '../app.ts';
import type { Env } from '../config/env.ts';
import { getState, setState } from '../services/BotState.ts';
import type { Command } from './command.ts';

export interface CommandScope {
  /** Human-readable target, for logs. */
  label: string;
  /** BotState key under which the last registered hash is stored. */
  stateKey: string;
}

export const commandScope = (env: Pick<Env, 'devGuildId'>): CommandScope =>
  env.devGuildId
    ? { label: `dev guild ${env.devGuildId}`, stateKey: `commandsHash:guild:${env.devGuildId}` }
    : { label: 'globally', stateKey: 'commandsHash:global' };

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)])
    );
  }
  return value;
};

/** SHA-256 of the commands' JSON with object keys sorted, so it only changes with their content. */
export function hashCommands(commands: readonly Command[]): string {
  const body = commands.map((command) => canonical(command.toJSON()));
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

/** Bulk-overwrites the application's commands in the env's scope and returns how many were set. */
export async function putCommands(
  env: Pick<Env, 'token' | 'clientId' | 'devGuildId'>,
  commands: readonly Command[]
): Promise<number> {
  const rest = new REST({ version: '10' }).setToken(env.token);
  const route = env.devGuildId
    ? Routes.applicationGuildCommands(env.clientId, env.devGuildId)
    : Routes.applicationCommands(env.clientId);
  const data = (await rest.put(route, { body: commands.map((c) => c.toJSON()) })) as unknown[];
  return data.length;
}

export type PutCommands = typeof putCommands;

/** Registers commands only when they differ from what was last registered for this scope. */
export async function syncCommands(
  app: Pick<App, 'env' | 'db' | 'logger' | 'clock'>,
  commands: readonly Command[],
  put: PutCommands = putCommands
): Promise<'registered' | 'unchanged' | 'failed'> {
  const { env, db, logger, clock } = app;
  const scope = commandScope(env);
  const hash = hashCommands(commands);

  if (getState(db, scope.stateKey) === hash) {
    logger.info(`Application commands unchanged, skipping registration ${scope.label}`, {
      hash: hash.slice(0, 12),
    });
    return 'unchanged';
  }

  logger.info(`Registering ${commands.length} application commands ${scope.label}`);
  try {
    const count = await put(env, commands);
    setState(db, scope.stateKey, hash, clock());
    logger.info(`Registered ${count} application commands ${scope.label}`, {
      hash: hash.slice(0, 12),
    });
    return 'registered';
  } catch (error) {
    logger.error('Failed to register application commands', { scope: scope.label }, error);
    return 'failed';
  }
}
