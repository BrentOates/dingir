import path from 'node:path';
import { env } from '../config/env';
import { Client, Collection, Partials, GatewayIntentBits } from 'discord.js';
import { Command } from '../framework/command';
import { bindEvent } from '../framework/event';
import { loadCommands, loadEvents } from '../framework/loader';
import { registerShutdownHook, runShutdownHooks } from '../framework/shutdown';
import { Logger } from '../utilities/Logger';
import { migrate } from './database/migrator';
import { sequelize } from './database/sequelize';

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
    const applied = await migrate(sequelize);
    Logger.info('Database migrations complete', { applied: applied.length ? applied : 'none' });
    registerShutdownHook(() => sequelize.close());

    const [commands, events] = await Promise.all([
      loadCommands(path.join(__dirname, '..', 'slash-commands')),
      loadEvents(path.join(__dirname, '..', 'events')),
    ]);

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
