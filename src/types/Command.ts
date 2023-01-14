import { ChannelType, Message } from 'npm:discord.js';
import { ServerConfig } from '../client/models/ServerConfig.ts';
import { NovaClient } from '../client/NovaClient.ts';

export interface Command {
  name: string;
  run(
    client: NovaClient,
    message: Message,
    config: ServerConfig,
    args: string[]
  ): Promise<void>;
  title: string;
  description: string;
  usage: string;
  example: string;
  admin: boolean;
  deleteCmd: boolean;
  limited: boolean;
  limitation?: string;
  channels: ChannelType[];
}
