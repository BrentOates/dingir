import { glob } from 'glob';
import { Client, Collection, Partials, GatewayIntentBits } from 'discord.js';
import { Event } from '../types/Event';
import { Logger } from '../utilities/Logger';
import 'dotenv/config';
import { sequelize } from './database/sequelize';
import { SlashCommand } from '../types/SlashCommand';

class NovaClient extends Client {
	public events: Collection<string, Event> = new Collection();
	public slashCommands: Collection<string, SlashCommand> = new Collection();

  public constructor() {
    super({
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.GuildMember,
      ],
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
    await sequelize.sync({alter: true,});

		const eventFiles: string[] = await glob(
			`${__dirname}/../events/**/*{.js,.ts}`
		);
		const slashCommandFiles: string[] = await glob(
			`${__dirname}/../slash-commands/*/*{.js,.ts}`
		);

		eventFiles.forEach(async (eventFile: string) => {
			const importedEvent = await import(eventFile);
			const event = (importedEvent.default ?? importedEvent) as Event;
			this.events.set(event.name, event);
			this.on(event.name, event.run.bind(null, this));
		});

		slashCommandFiles.forEach(async (slashCommandFile: string) => {
			const importedCommand = await import(slashCommandFile);
			const cmd = (importedCommand.default ?? importedCommand) as SlashCommand;
			this.slashCommands.set(cmd.commandData.name, cmd);
		});

		process.on('SIGTERM', () => {
			Logger.writeLog('SIGTERM Received, destroying client & shutting down.');
			this.destroy();
			process.exit();
		});

    await this.login(process.env.TOKEN);
    Logger.writeLog('Logged in');
  }
}

export { NovaClient };
