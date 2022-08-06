import { ChannelType, ChatInputCommandInteraction, Message, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { EmbedColours } from '../../resources/EmbedColours';
import { Command } from '../../types/Command';
import { ServerConfig } from '../../client/models/ServerConfig';
import { ChannelService } from '../../utilities/ChannelService';
import { EmbedCompatLayer } from '../../utilities/EmbedCompatLayer';
import { SlashCommand } from '../../types/SlashCommand';

const run = async (interaction: ChatInputCommandInteraction, config: ServerConfig): Promise<any> => {

	if (args.length === 0) {
		if (!config.guestRoleIds) {
			return message.channel.send('No guest roles set');
		}

		const currentGuestRoles = [];
		const guildRoles = await message.guild.roles.fetch();
		const guestRoleIds = config.guestRoleIds.split(',');

		guestRoleIds.forEach(roleId => {
			const guestRole = guildRoles.get(roleId);
			currentGuestRoles.push(guestRole ? guestRole.toString() : 'Unknown');
		});

		const embed = new EmbedCompatLayer()
			.setColor(EmbedColours.info)
			.setTitle('Current Guest Roles')
			.setDescription(currentGuestRoles.join('\n'))
			.setTimestamp();

		return message.channel.send({
			embeds: [embed]
		});
	}

	const newRoleIds = message.mentions.roles.map(role => role.id);

	if (args[0] === 'unset') {
		config.guestRoleIds = null;
	} else if (!newRoleIds) {
		return message.channel.send('Roles not found, make sure you tagged it correctly.');
	} else {
		config.guestRoleIds = newRoleIds.join(',');
	}


	await config.save();

	const audit = new EmbedCompatLayer()
		.setColor(EmbedColours.info)
		.setAuthor({
			name: message.author.tag, iconURL: message.author.displayAvatarURL()
		})
		.setDescription(`Guest roles ${!config.guestRoleIds ? 'Removed' : 'Updated'}`)
		.setTimestamp();

	if (!config.guestRoleIds) {
		audit.addField('New Guest Roles', 'Not set');
	} else {
		audit.addField('New Guest Roles', message.mentions.roles.map(role => role.toString()).join('\n'));
	}

	await ChannelService.sendAuditMessage(client, config, audit);

	if (config.guestRoleIds) {
		return message.channel.send('Guest User role(s) updated.');
	} else {
		return message.channel.send('Guest User role removed.');
	}

};

export const data = new SlashCommandBuilder()
	.setName('screenroles')
	.addSubcommand(sub =>
		sub
			.setName('get')
			.setDescription('Gets the roles assigned to newly screened members'))
	.addSubcommand(sub =>
		sub
			.setDescription('Sets the roles of newly screened members')
			.addRoleOption(option =>
				option.setName('role-one')
					.setDescription('First role to give to newly screened members')
					.setRequired(true))
			.addRoleOption(option =>
				option
					.setName('role-two')
					.setDescription('Second optional role to give to newly screened members'))
	);

const slashCommand: SlashCommand = {
	commandData: data,
	execute: run

}

