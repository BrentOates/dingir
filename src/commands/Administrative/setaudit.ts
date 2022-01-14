import { Message } from 'discord.js';
import { NovaClient } from '../../client/NovaClient';
import { Command } from '../../types/Command';
import { ServerConfig } from '../../types/ServerConfig';
import { ConfigManager } from '../../utilities/ConfigManager';

const run = async (client: NovaClient, message: Message, config: ServerConfig, args: any[]): Promise<any> => {
	await ConfigManager.updateChannel(config, message, 'auditChannelId', args);
};

const command: Command = {
	name: 'setaudit',
	title: 'Set the audit channel',
	description: 'Sets the channel where the bot posts audit logs.',
	usage: 'setaudit <channel mention>',
	example: 'setaudit #general',
	admin: true,
	deleteCmd: false,
	limited: false,
	channels: ['GUILD_TEXT'],
	run: run
};

export = command;
