import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { ServerConfig } from '../../client/models/ServerConfig';
import { SlashCommand, SlashSubCommand, SlashSubGroupCommand } from '../../types/SlashCommand';
import { AnnouncementsCommand } from './Subcommands/announcements';
import { AuditCommand } from './Subcommands/audit';
import { BirthdaysConfigCommand } from './Subcommands/birthdays';
import { DebugCommand } from './Subcommands/debug';
import { NewRolesCommand } from './Subcommands/newroles';
import { SystemMessagesCommand } from './Subcommands/systemMsgs';
import { WelcomeCommand } from './Subcommands/welcome';

const cmdMap: {[key: string]: SlashSubGroupCommand | SlashSubCommand} = {
	announcements: AnnouncementsCommand,
	debug: DebugCommand,
	sysmsgs: SystemMessagesCommand,
	audit: AuditCommand,
	welcome: WelcomeCommand,
	newroles: NewRolesCommand,
	birthdays: BirthdaysConfigCommand
};

const execute = async (cmd: ChatInputCommandInteraction, config: ServerConfig) => {
	const subCommand = cmd.options.getSubcommandGroup() ?? cmd.options.getSubcommand();
	const subCmd = cmdMap[subCommand];

	if (!subCommand) {
		cmd.reply({ content: 'This command is misconfigured', ephemeral: true });
	}

	subCmd.execute(cmd, config);
};

const commandData = new SlashCommandBuilder()
	.setName('config')
	.setDescription('Manage configuration data for this server')
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.setDMPermission(false)
	.addSubcommandGroup(AnnouncementsCommand.commandData)
	.addSubcommandGroup(DebugCommand.commandData)
	.addSubcommandGroup(SystemMessagesCommand.commandData)
	.addSubcommandGroup(AuditCommand.commandData)
	.addSubcommandGroup(WelcomeCommand.commandData)
	.addSubcommandGroup(NewRolesCommand.commandData)
	.addSubcommandGroup(BirthdaysConfigCommand.commandData);

const slashCommand: SlashCommand = {
	commandData: commandData,
	execute: execute
}; 
export = slashCommand;