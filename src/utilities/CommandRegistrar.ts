import { REST, Routes } from 'discord.js';
import { NovaClient } from '../client/NovaClient';
import { Logger } from './Logger';

export class CommandRegistrar {
	public static async registerGlobalCommands(client: NovaClient) {
		Logger.writeLog('Registering Global Commands...');
		const cmdData = client.slashCommands.map(v => v.commandData.toJSON());

		const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

		rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: cmdData })
			.then((data: any) => Logger.writeLog(`Successfully registered ${data.length} application commands.`))
			.catch(console.error);
	}
}
