import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from 'discord.js';
import { ServerConfig } from '../../client/models/ServerConfig';

export const execute = async (interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<any> => {
	const newValue = interaction.options.getBoolean('state');
	config.debug = newValue;

  await config.save();

	return await interaction.reply({
		content: `Debug mode ${config.debug ? 'enabled' : 'disabled'} for ${interaction.guild.name}.`,
		ephemeral: true
	});
};

export const data = new SlashCommandBuilder()
	.setName('debug')
	.setDescription('Toggles showing debug messages in this server when errors occur.')
	.addBooleanOption(option => 
		option.setName('state')
			.setDescription('Whether debug mode should be enabled or disabled')
			.setRequired(true))
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.setDMPermission(false);
