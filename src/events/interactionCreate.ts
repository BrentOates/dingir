import { ChatInputCommandInteraction, Interaction } from 'discord.js';
import { NovaClient } from '../client/NovaClient';
import { RunFunction } from '../types/Event';
import { ConfigService } from '../utilities/ConfigService';
import { Logger } from '../utilities/Logger';
import { UserProfileService } from '../utilities/UserProfileService';
import { ServerConfig } from '../client/models/ServerConfig';

export const name = 'interactionCreate';

const runCommand = async (client: NovaClient, cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	const slashCmd = client.slashCommands.get(cmd.commandName);

	if (!slashCmd) {
		return;
	}

	await slashCmd.execute(cmd, config)
		.catch((err: string) => {
			cmd.reply('Something went wrong, was this command run in the correct place?');
			Logger.writeError(err);
		});
};

export const run: RunFunction = async (client: NovaClient, interaction: Interaction) => {
	if (!interaction.isChatInputCommand()) {
		return;
	}

	if (!interaction.guild) {
		return interaction.reply({
			content: 'Dingir only supports interactions in Discord Servers.',
			ephemeral: true
		});
	}

	const serverConfig = await ConfigService.getConfigByMessage(interaction);
	await UserProfileService.incrementActivityScore(interaction.guild.id, interaction.user.id);
	
	if (serverConfig) {
		await runCommand(client, interaction, serverConfig);
	}
};
