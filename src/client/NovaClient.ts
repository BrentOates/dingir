import { env } from '../config/env';
import { glob } from 'glob';
import { Client, Collection, Partials, GatewayIntentBits } from 'discord.js';
import { Event } from '../types/Event';
import { Logger } from '../utilities/Logger';
import { sequelize } from './database/sequelize';
import { SlashCommand } from '../types/SlashCommand';

class NovaClient extends Client {
  public events: Collection<string, Event> = new Collection();
  public slashCommands: Collection<string, SlashCommand> = new Collection();

  public constructor() {
    super({
      partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
  }

  public async start(): Promise<void> {
    await sequelize.sync({ alter: true });

    const eventFiles: string[] = await glob(`${__dirname}/../events/**/*{.js,.ts}`);
    const slashCommandFiles: string[] = await glob(`${__dirname}/../slash-commands/*/*{.js,.ts}`);

    for (const eventFile of eventFiles) {
      const importedEvent = await import(eventFile);
      const event = (importedEvent.default ?? importedEvent) as Event;
      this.events.set(event.name, event);
      this.on(event.name, (...args: any[]) => {
        event.run(this, ...args).catch((err: unknown) => {
          Logger.writeError(`Unhandled error in ${event.name} event handler.`, err);
        });
      });
    }

    for (const slashCommandFile of slashCommandFiles) {
      const importedCommand = await import(slashCommandFile);
      const cmd = (importedCommand.default ?? importedCommand) as SlashCommand;
      this.slashCommands.set(cmd.commandData.name, cmd);
    }

    process.on('SIGTERM', () => {
      Logger.writeLog('SIGTERM Received, destroying client & shutting down.');
      this.destroy()
        .catch((err: unknown) => Logger.writeError('Error destroying client.', err))
        .finally(() => process.exit());
    });

    await this.login(env.token);
    Logger.writeLog('Logged in');
  }
}

export { NovaClient };
