import { CommandAccess } from '../utilities/CommandAccess';
import {  Message } from 'discord.js';
import { NovaClient } from '../client/NovaClient';
import { RunFunction } from '../types/Event';
import { ServerConfig } from '../types/ServerConfig';
import { ConfigService } from '../utilities/ConfigService';
import { Logger } from '../utilities/Logger';
import { UserProfileService } from '../utilities/UserProfileService';

export const name = 'messageCreate';

const runCommand = async (client: NovaClient, message: Message, config: ServerConfig, command: string, args: any[]) => {

	const cmd = client.commands.get(command);

	if (!cmd) return;

	const commandAccess = new CommandAccess();
	const access = commandAccess.verifyAccess(cmd, message, config);

	if (!access.hasAccess) {
		return message.channel.send(access.reason);
	} else {
		await cmd.run(client, message, config, args)
			.catch((err: string) => {
				message.channel.send('Something went wrong, was this command run in the correct place?');
				Logger.writeError(err);
			});

		if (cmd.deleteCmd) {
			message.delete();
		}
	}
};

export const run: RunFunction = async (client: NovaClient, message: Message) => {
	if (message.partial)
		await message.fetch();

	if (message.author.bot) return;

	let serverConfig: ServerConfig | undefined;
	if (message.guild) {
		serverConfig = await ConfigService.getConfigByMessage(message);
		UserProfileService.incrementActivityScore(message.guild.id, message.author.id);
		
		if (serverConfig) {
			if (!message.content.startsWith(serverConfig.prefix)) return;
			const args = message.content.slice(serverConfig.prefix.length).trim().split(/ +/g);
			const command = args.shift().toLowerCase();
	
			runCommand(client, message, serverConfig, command, args);
		}

	} else if (!message.guild) {
		const args = message.content.trim().split(/ +/g);
		const command = args.shift().toLowerCase();

		runCommand(client, message, serverConfig, command, args);
	}
};
