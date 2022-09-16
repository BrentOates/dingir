import { Message } from 'discord.js';
import { ServerConfig } from '../client/models/ServerConfig';
import { Command } from '../types/Command';

export class CommandAccess {
  hasAccess: boolean;
  reason: string;

  public verifyAccess(
    cmd: Command,
    message: Message,
    config: ServerConfig
  ): CommandAccess {
    if (message.guild && cmd.channels.includes(message.channel.type)) {
      if (!config) {
        this.hasAccess = false;
        this.reason = 'Unable to retrieve server config from API.';
      } else if (cmd.admin || cmd.limited) {
        if (!config.adminRoleId && !cmd.limited) {
          this.hasAccess = false;
          this.reason =
            "This command requires an Admin, but an admin role has not been set. Please see the 'setadmin' command.";
        } else if (!config.adminRoleId && cmd.limited) {
          this.hasAccess = true;
        } else if (!message.member.roles.cache.has(config.adminRoleId)) {
          this.hasAccess = false;
          this.reason = 'This command can only be used by an Administrator.';
        } else if (message.member.roles.cache.has(config.adminRoleId)) {
          this.hasAccess = true;
        } else {
          this.hasAccess = false;
          this.reason =
            'There is a permissions related error executing this command.';
        }
      } else if (!cmd.admin && !cmd.limited) {
        this.hasAccess = true;
      } else {
        this.hasAccess = false;
        this.reason =
          'There is a permissions related error executing this command.';
      }
    } else if (cmd.channels.includes(message.channel.type)) {
      this.hasAccess = true;
    } else {
      this.hasAccess = false;
      this.reason = 'This command is not available in this channel.';
    }

    return this;
  }
}
