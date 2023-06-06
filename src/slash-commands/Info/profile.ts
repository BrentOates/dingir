import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder, SlashCommandUserOption } from 'discord.js';
import { EmbedColours } from '../../resources/EmbedColours';
import { EmbedCompatLayer } from '../../types/EmbedCompatLayer';
import { SlashCommand } from '../../types/SlashCommand';
import { UserProfileService } from '../../utilities/UserProfileService';

const execute = async (cmd: ChatInputCommandInteraction) => {
	const user = cmd.options.getUser('member');
	const member = cmd.guild.members.cache.get(user.id);

	const userProfile = await UserProfileService.getUserProfile(
		cmd.guild.id,
		member.id
	);

	const embed = new EmbedCompatLayer()
		.setThumbnail(member.displayAvatarURL())
		.setColor(EmbedColours.info)
		.setTitle('User Profile')
		.setTimestamp()
		.addField('Member', member.toString())
		.addField('Nickname', member.nickname ? member.nickname : 'Not set')
		.addField('Username', member.user.tag.endsWith('#0') ? member.user.username : member.user.tag)
		.addField('Joined', `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`)
		.addField('Screening', member.pending ? 'Not completed' : 'Passed')
		.addField(
			'Activity Score',
			userProfile ? userProfile.activityScore.toString() : 'Not found'
		)
		.addField('ID', member.user.id);

	return cmd.reply({
		embeds: [embed],
		ephemeral: true
	});
};

const commandData = new SlashCommandBuilder()
	.setName('profile')
	.setDescription('Fetches profiles for server members')
	.addUserOption((opt: SlashCommandUserOption) => opt
		.setName('member')
		.setDescription('Member to fetch profile for')
		.setRequired(true))
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.setDMPermission(false);

const slashCommand: SlashCommand = {
	commandData: commandData,
	execute: execute
};
export = slashCommand;