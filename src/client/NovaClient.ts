import { env } from '../config/env.ts';
import { Client, Collection, Partials, GatewayIntentBits } from 'discord.js';
import type { Command } from '../framework/command.ts';
import { bindEvent } from '../framework/event.ts';
import { validateRegistry } from '../framework/registry.ts';
import { commands } from '../slash-commands/index.ts';
import { events } from '../events/index.ts';
import { registerShutdownHook, runShutdownHooks } from '../framework/shutdown.ts';
import { Logger } from '../utilities/Logger.ts';
import { getDatabase } from './database/db.ts';
import { migrate } from './database/migrator.ts';

class NovaClient extends Client {
  public slashCommands: Collection<string, Command> = new Collection();
  private shuttingDown = false;

  public constructor() {
    super({
      partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
  }

  public async start(): Promise<void> {
    const { sqlite } = getDatabase();
    const applied = migrate(sqlite);
    Logger.info('Database migrations complete', { applied: applied.length ? applied : 'none' });
    registerShutdownHook(() => {
      sqlite.close();
    });

    validateRegistry('command', commands);
    validateRegistry('event', events);

    for (const command of commands) {
      this.slashCommands.set(command.name, command);
    }
    for (const event of events) {
      bindEvent(this, event);
    }

    this.on('error', (error) => Logger.error('Discord client error', undefined, error));
    this.on('warn', (message) => Logger.warn(message));
    process.on('unhandledRejection', (reason) =>
      Logger.error('Unhandled promise rejection', undefined, reason)
    );
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.on(signal, () => {
        void this.shutdown(signal);
      });
    }

    await this.login(env.token);
    Logger.info('Logged in');
  }

  private async shutdown(signal: string): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;
    Logger.info(`${signal} received, shutting down`);
    try {
      await this.destroy();
    } catch (error) {
      Logger.error('Error destroying client', undefined, error);
    }
    await runShutdownHooks();
    process.exit(0);
  }
}

export { NovaClient };
