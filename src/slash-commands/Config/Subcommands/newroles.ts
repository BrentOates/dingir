import { SlashCommandSubcommandGroupBuilder, SlashCommandSubcommandBuilder, ChatInputCommandInteraction, SlashCommandRoleOption } from 'discord.js';
import { ServerConfig } from '../../../client/models/ServerConfig';
import { EmbedColours } from '../../../resources/EmbedColours';
import { EmbedCompatLayer } from '../../../types/EmbedCompatLayer';
import { SlashSubGroupCommand } from '../../../types/SlashCommand';
import { ChannelService } from '../../../utilities/ChannelService';

const set = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
    const role1 = cmd.options.getRole('role-one');
	const role2 = cmd.options.getRole('role-two');

	const newGuestRoles: string = [role1, role2].filter(Boolean).join(',');
	config.guestRoleIds = newGuestRoles;
	config.save();

	return get(cmd, config);
};

const get = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	if (!config.guestRoleIds) {
		return cmd.reply('No guest roles configured for this server');
	}

	const roleIds: string[] = config.guestRoleIds.split(',');
	const roles = cmd.guild.roles.cache.filter(r => roleIds.includes(r.id));

	const audit = new EmbedCompatLayer()
	.setColor(EmbedColours.info)
	.setAuthor({
		name: cmd.user.tag, iconURL: cmd.user.displayAvatarURL()
	})
	.setDescription(`New user roles ${!config.guestRoleIds ? 'Removed' : 'Updated'}`)
	.setTimestamp();

	if (config.guestRoleIds) {
		audit.addField('New user roles', roles.map(r => r.toString()).join('\n'));
	}

	if (roles.size !== roleIds.length) {
		audit.addField('WARNING', 'Not all roles configured are available in this server, please reconfigure new user roles');
	}

	ChannelService.sendAuditMessage(cmd.client, config, audit);
	cmd.reply(`New user roles ${!config.guestRoleIds ? 'Removed' : 'Updated'}`);
};

const clear = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	config.guestRoleIds = null;
	config.save();

	return get(cmd, config);
};

const exec = async(cmd: ChatInputCommandInteraction, config: ServerConfig) => {
    const subCommand = cmd.options.getSubcommand();
    if (subCommand == 'set') {
		return set(cmd, config);
	} else if (subCommand == 'get') {
		return get(cmd, config);
	} else if (subCommand == 'clear') {
		return clear(cmd, config);
	} else {
		return cmd.reply('A valid option was not supplied for this command');
	}
};

const data = new SlashCommandSubcommandGroupBuilder()
	.setName('newroles')
	.setDescription('Control the roles assigned to newly screened members')
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('get')
		.setDescription('Gets the roles assigned to newly screened members'))
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('set')
		.setDescription('Sets the roles of newly screened members')
		.addRoleOption((option: SlashCommandRoleOption) => option
			.setName('role-one')
			.setDescription('First role to give to newly screened members')
			.setRequired(true))
		.addRoleOption((option: SlashCommandRoleOption) => option
			.setName('role-two')
			.setDescription('Second optional role to give to newly screened members')))
	.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub
		.setName('clear')
		.setDescription('Clears the roles assigned to newly screened members'));

export const NewRolesCommand: SlashSubGroupCommand = {
	commandData: data,
	execute: exec
};