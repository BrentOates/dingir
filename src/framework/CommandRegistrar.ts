import { env } from '../config/env';
import { REST, Routes } from 'discord.js';
import { Command } from './command';
import { Logger } from '../utilities/Logger';

export class CommandRegistrar {
  public static async register(commands: Command[]): Promise<void> {
    const guildId = env.devGuildId;
    const scope = guildId ? `dev guild ${guildId}` : 'globally';
    Logger.info(`Registering ${commands.length} application commands ${scope}`);

    const rest = new REST({ version: '10' }).setToken(env.token);
    const route = guildId
      ? Routes.applicationGuildCommands(env.clientId, guildId)
      : Routes.applicationCommands(env.clientId);

    try {
      const data = (await rest.put(route, { body: commands.map((c) => c.toJSON()) })) as unknown[];
      Logger.info(`Registered ${data.length} application commands ${scope}`);
    } catch (error) {
      Logger.error('Failed to register application commands', { scope }, error);
    }
  }
}
