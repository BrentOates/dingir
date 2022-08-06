import { CommandAccess } from '../utilities/CommandAccess';
import { Interaction, Message } from 'discord.js';
import { NovaClient } from '../client/NovaClient';
import { RunFunction } from '../types/Event';
import { ConfigService } from '../utilities/ConfigService';
import { Logger } from '../utilities/Logger';
import { UserProfileService } from '../utilities/UserProfileService';
import { ServerConfig } from '../client/models/ServerConfig';

export const name = 'interactionCreate';

const runCommand = async (client: NovaClient, message: Message, config: ServerConfig, command: string, args: any[]) => {

	const cmd = client.commands.get(command);

	if (!cmd) {
		return;
	}

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
			await message.delete();
		}
	}
};

export const run: RunFunction = async (client: NovaClient, interaction: Interaction) => {
	if (!interaction.isChatInputCommand()) {
		return;
	}

	let serverConfig: ServerConfig | undefined;
	if (interaction.guild) {
		serverConfig = await ConfigService.getConfigByMessage(interaction);
		await UserProfileService.incrementActivityScore(interaction.guild.id, interaction.user.id);
		
		if (serverConfig) {
			if (!message.content.startsWith(serverConfig.prefix)) {
				return;
			}
			const args = message.content.slice(serverConfig.prefix.length).trim().split(/ +/g);
			const command = args.shift().toLowerCase();
	
			await runCommand(client, message, serverConfig, command, args);
		}

	} else if (!message.guild) {
		const args = message.content.trim().split(/ +/g);
		const command = args.shift().toLowerCase();

		await runCommand(client, message, serverConfig, command, args);
	}
};
