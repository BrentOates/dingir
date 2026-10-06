/*
 * COMMAND REGISTRATION SPEC
 *
 * Persisted state (BotState, keyed by application id so another bot sharing the database is
 * independent):
 *   commandsHash:<client>:<scope>  hash of the commands last registered successfully in <scope>
 *   commandsScope:<client>         the scope last registered successfully and fully cleaned up
 * A scope is `global` or `guild:<DEV_GUILD_ID>`; the env's DEV_GUILD_ID picks the current one.
 *
 * Transitions (last recorded scope -> current scope, on startup or `npm run deploy:commands`):
 *   same scope, hash equal                 skip (startup) / register again (deploy script)
 *   same scope, hash differs or missing    register, record hash
 *   none recorded                          register, record hash and scope (re-registers once)
 *   guild:X -> global | guild:Y            register, then clear guild X, then record the scope
 *   global  -> guild:Y                     register in Y; global commands are never cleared
 *                                          automatically (may be production), a warning says so
 *
 * Invariants:
 *   1. The hash is recorded only after a successful register, so a failed or interrupted
 *      registration is retried on the next start; nothing is cleared or recorded when it fails.
 *   2. The scope is recorded only after the previous dev guild was cleaned up (or cannot be:
 *      the bot is gone from it), so a failed cleanup is retried on every start until it works.
 *   3. A recorded hash is trusted only while the recorded scope equals the current scope, so
 *      switching scope always re-registers, even back to a scope whose old hash still matches.
 *   4. Registration failure at startup is logged and never stops the bot.
 *
 * Failure handling: Discord errors on register -> 'failed' (retry next start); on cleanup ->
 * keep the old scope (retry), except Unknown Guild / Missing Access, where the guild's commands
 * are unreachable and nothing remains to be done.
 */

import { createHash } from 'node:crypto';
import { REST, Routes } from 'discord.js';
import type { App } from '../app.ts';
import type { Env } from '../config/env.ts';
import { getState, setState } from '../services/BotState.ts';
import { classifyGuildFetchError } from '../services/RetentionPolicy.ts';
import type { Command } from './command.ts';

export interface CommandScope {
  /** Human-readable target, for logs. */
  label: string;
  /** BotState key under which the last registered hash is stored. */
  stateKey: string;
  /** BotState key under which the last successfully registered scope is stored. */
  scopeKey: string;
  /** `global` or `guild:<id>`; what is stored under scopeKey. */
  scope: string;
}

/** The key includes the application id so a different bot sharing this database re-registers. */
export const commandScope = (env: Pick<Env, 'devGuildId' | 'clientId'>): CommandScope =>
  env.devGuildId
    ? {
        label: `dev guild ${env.devGuildId}`,
        stateKey: `commandsHash:${env.clientId}:guild:${env.devGuildId}`,
        scopeKey: `commandsScope:${env.clientId}`,
        scope: `guild:${env.devGuildId}`,
      }
    : {
        label: 'globally',
        stateKey: `commandsHash:${env.clientId}:global`,
        scopeKey: `commandsScope:${env.clientId}`,
        scope: 'global',
      };

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
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
  commands: readonly Command[],
): Promise<number> {
  const rest = new REST({ version: '10' }).setToken(env.token);
  const route = env.devGuildId
    ? Routes.applicationGuildCommands(env.clientId, env.devGuildId)
    : Routes.applicationCommands(env.clientId);
  const data = (await rest.put(route, { body: commands.map((c) => c.toJSON()) })) as unknown[];
  return data.length;
}

export type PutCommands = typeof putCommands;

/** Removes every application command from one guild. */
export async function clearGuildCommands(
  env: Pick<Env, 'token' | 'clientId'>,
  guildId: string,
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(env.token);
  await rest.put(Routes.applicationGuildCommands(env.clientId, guildId), { body: [] });
}

export type ClearGuildCommands = typeof clearGuildCommands;

export interface RegistrarDeps {
  put?: PutCommands;
  clear?: ClearGuildCommands;
}

/**
 * Registers commands in the env's scope, then records the hash and scope. When the last scope
 * was a dev guild and the scope has changed, that guild's commands are cleared so they do not
 * linger as duplicates. Global commands are never cleared automatically (they may be production).
 * Throws if registration fails, in which case nothing is cleared or recorded.
 */
export async function registerCommands(
  app: Pick<App, 'env' | 'db' | 'logger' | 'clock'>,
  commands: readonly Command[],
  deps: RegistrarDeps = {},
): Promise<number> {
  const { env, db, logger, clock } = app;
  const { put = putCommands, clear = clearGuildCommands } = deps;
  const scope = commandScope(env);
  const hash = hashCommands(commands);

  const count = await put(env, commands);
  setState(db, scope.stateKey, hash, clock());

  const previous = getState(db, scope.scopeKey);
  let cleaned = false;
  let scopeRecorded = true;
  if (previous?.startsWith('guild:') && previous !== scope.scope) {
    const guildId = previous.slice('guild:'.length);
    try {
      await clear(env, guildId);
      cleaned = true;
      logger.info('Cleared application commands from the previous dev guild', { guild: guildId });
    } catch (error) {
      if (classifyGuildFetchError(error) === 'gone') {
        // The bot is no longer in that guild, so its commands there are gone with it.
        logger.info('Previous dev guild is unreachable; nothing to clear', { guild: guildId });
      } else {
        scopeRecorded = false; // keep the old scope so the next run retries the cleanup
        logger.warn(
          'Could not clear application commands from the previous dev guild; remove them manually',
          { guild: guildId },
          error,
        );
      }
    }
  }
  if (scopeRecorded) {
    setState(db, scope.scopeKey, scope.scope, clock());
  }

  if (env.devGuildId) {
    logger.warn(
      'Commands were registered to the dev guild only; global commands may also exist and show up as duplicates. Run `npm run deploy:commands` without DEV_GUILD_ID to manage global commands, or remove them manually.',
      { scope: scope.label },
    );
  } else if (!cleaned && (previous === undefined || !scopeRecorded)) {
    logger.warn(
      'Commands were registered globally; guild-scoped commands from an earlier DEV_GUILD_ID run may still exist and show up as duplicates. Remove them manually if so.',
      { scope: scope.label },
    );
  }
  return count;
}

/** Registers commands only when they differ from what was last registered for this scope. */
export async function syncCommands(
  app: Pick<App, 'env' | 'db' | 'logger' | 'clock'>,
  commands: readonly Command[],
  put: PutCommands | RegistrarDeps = {},
): Promise<'registered' | 'unchanged' | 'failed'> {
  const { env, db, logger } = app;
  const deps = typeof put === 'function' ? { put } : put;
  const scope = commandScope(env);
  const hash = hashCommands(commands);
  const previousScope = getState(db, scope.scopeKey);

  // A changed (or unrecorded) scope must re-register even when this scope's stored hash still
  // matches, so the previous dev guild gets cleaned up and the scope gets recorded.
  if (getState(db, scope.stateKey) === hash && previousScope === scope.scope) {
    logger.info(`Application commands unchanged, skipping registration ${scope.label}`, {
      hash: hash.slice(0, 12),
    });
    return 'unchanged';
  }

  logger.info(`Registering ${commands.length} application commands ${scope.label}`);
  try {
    const count = await registerCommands(app, commands, deps);
    logger.info(`Registered ${count} application commands ${scope.label}`, {
      hash: hash.slice(0, 12),
    });
    return 'registered';
  } catch (error) {
    logger.error('Failed to register application commands', { scope: scope.label }, error);
    return 'failed';
  }
}
