import { REST, Routes } from 'discord.js';
import type { App } from '../app.ts';
import type { Command } from './command.ts';

export async function registerCommands(app: App, commands: Command[]): Promise<void> {
  const { env, logger } = app;
  const guildId = env.devGuildId;
  const scope = guildId ? `dev guild ${guildId}` : 'globally';
  logger.info(`Registering ${commands.length} application commands ${scope}`);

  const rest = new REST({ version: '10' }).setToken(env.token);
  const route = guildId
    ? Routes.applicationGuildCommands(env.clientId, guildId)
    : Routes.applicationCommands(env.clientId);

  try {
    const data = (await rest.put(route, { body: commands.map((c) => c.toJSON()) })) as unknown[];
    logger.info(`Registered ${data.length} application commands ${scope}`);
  } catch (error) {
    logger.error('Failed to register application commands', { scope }, error);
  }
}
