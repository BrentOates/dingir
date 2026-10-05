import { Client, Collection, Partials, GatewayIntentBits } from 'discord.js';
import type { App } from '../app.ts';
import type { Command } from '../framework/command.ts';
import { bindEvent } from '../framework/event.ts';
import { validateRegistry } from '../framework/registry.ts';
import { commands } from '../commands/index.ts';
import { events } from '../events/index.ts';

class DingirClient extends Client {
  public slashCommands: Collection<string, Command> = new Collection();
  private readonly app: App;

  public constructor(app: App) {
    super({
      partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    this.app = app;
  }

  public async start(): Promise<void> {
    const { env, logger } = this.app;

    validateRegistry('command', commands);
    validateRegistry('event', events);

    for (const command of commands) {
      this.slashCommands.set(command.name, command);
    }
    for (const event of events) {
      bindEvent(this.app, this, event);
    }

    this.on('error', (error) => logger.error('Discord client error', undefined, error));
    this.on('warn', (message) => logger.warn(message));
    this.app.shutdown.register(() => this.destroy());

    await this.login(env.token);
    logger.info('Logged in');
  }
}

export { DingirClient };
