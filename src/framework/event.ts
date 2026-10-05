import type { Client} from 'discord.js';
import { type ClientEvents } from 'discord.js';
import type { App } from '../app.ts';
import type { DingirClient } from '../client/DingirClient.ts';

export interface EventDefinition<K extends keyof ClientEvents> {
  name: K;
  once?: boolean;
  run(app: App, client: DingirClient, ...args: ClientEvents[K]): Promise<void>;
}

export type AnyEventDefinition = { [K in keyof ClientEvents]: EventDefinition<K> }[keyof ClientEvents];

export function defineEvent<K extends keyof ClientEvents>(
  def: EventDefinition<K>
): EventDefinition<K> {
  return def;
}

const guildIdOf = (arg: unknown): string | undefined => {
  if (typeof arg !== 'object' || arg === null) {
    return undefined;
  }
  const candidate = arg as { guildId?: unknown; guild?: { id?: unknown } | null };
  const id = candidate.guildId ?? candidate.guild?.id;
  return typeof id === 'string' ? id : undefined;
};

/** Registers an event on the client, logging (never throwing) handler failures. */
export function bindEvent<K extends keyof ClientEvents>(
  app: App,
  client: DingirClient,
  def: EventDefinition<K>
): void {
  const listener = (...args: ClientEvents[K]): void => {
    def.run(app, client, ...args).catch((error: unknown) => {
      app.logger.error('Event handler failed', { event: def.name, guild: guildIdOf(args[0]) }, error);
    });
  };
  const target: Client = client;
  if (def.once) {
    target.once(def.name, listener);
  } else {
    target.on(def.name, listener);
  }
}
