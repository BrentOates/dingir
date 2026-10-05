import { type ApplicationCommandOptionAllowedChannelTypes, Guild } from 'discord.js';
import { defineSubcommandGroup, type SubcommandGroupDefinition } from './command.ts';
import { ConfigService } from '../services/ConfigService.ts';

export type ChannelField = 'auditChannelId' | 'announcementsChannelId' | 'honeyPotChannelId';
export type BooleanField = 'debug' | 'systemMessagesEnabled';

export interface ChannelSettingOptions {
  name: string;
  description: string;
  field: ChannelField;
  label: string;
  channelTypes: ApplicationCommandOptionAllowedChannelTypes[];
}

export interface BooleanSettingOptions {
  name: string;
  description: string;
  field: BooleanField;
  label: string;
}

export const channelSetText = (label: string, channelId: string): string =>
  `${label} set to <#${channelId}>.`;

export const channelGetText = (
  label: string,
  channelId: string | null,
  exists: boolean
): string => {
  if (!channelId) {
    return `${label}: not set`;
  }
  return exists
    ? `${label}: <#${channelId}>`
    : `${label}: <#${channelId}> (this channel no longer exists in this server)`;
};

export const channelClearText = (label: string): string => `${label} cleared.`;

export const booleanText = (label: string, enabled: boolean): string =>
  `${label}: ${enabled ? 'enabled' : 'disabled'}`;

const channelExists = async (guild: Guild, id: string): Promise<boolean> => {
  if (guild.channels.cache.has(id)) {
    return true;
  }
  const fetched = await guild.channels.fetch(id).catch(() => null);
  return fetched !== null;
};

export function channelSetting(opts: ChannelSettingOptions): SubcommandGroupDefinition {
  const { field, label } = opts;
  return defineSubcommandGroup({
    name: opts.name,
    description: opts.description,
    subcommands: [
      {
        name: 'set',
        description: `Set the ${label.toLowerCase()}`,
        options: (b) =>
          b.addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription(`Channel to use for: ${label.toLowerCase()}`)
              .addChannelTypes(...opts.channelTypes)
              .setRequired(true)
          ),
        run: async (ctx) => {
          const channel = ctx.interaction.options.getChannel('channel', true);
          ctx.config = await ConfigService.updateConfig(ctx.config.serverId, {
            [field]: channel.id,
          });
          await ctx.reply(channelSetText(label, channel.id));
        },
      },
      {
        name: 'get',
        description: `Show the ${label.toLowerCase()}`,
        run: async (ctx) => {
          const id = ctx.config[field];
          const exists = id ? await channelExists(ctx.guild, id) : false;
          await ctx.reply(channelGetText(label, id, exists));
        },
      },
      {
        name: 'clear',
        description: `Clear the ${label.toLowerCase()}`,
        run: async (ctx) => {
          ctx.config = await ConfigService.updateConfig(ctx.config.serverId, { [field]: null });
          await ctx.reply(channelClearText(label));
        },
      },
    ],
  });
}

export function booleanSetting(opts: BooleanSettingOptions): SubcommandGroupDefinition {
  const { field, label } = opts;
  return defineSubcommandGroup({
    name: opts.name,
    description: opts.description,
    subcommands: [
      {
        name: 'set',
        description: `Enable or disable: ${label.toLowerCase()}`,
        options: (b) =>
          b.addBooleanOption((o) =>
            o.setName('enabled').setDescription(`Whether ${label.toLowerCase()} are on`).setRequired(true)
          ),
        run: async (ctx) => {
          const enabled = ctx.interaction.options.getBoolean('enabled', true);
          ctx.config = await ConfigService.updateConfig(ctx.config.serverId, { [field]: enabled });
          await ctx.reply(booleanText(label, enabled));
        },
      },
      {
        name: 'get',
        description: `Show whether ${label.toLowerCase()} are enabled`,
        run: async (ctx) => {
          await ctx.reply(booleanText(label, ctx.config[field]));
        },
      },
    ],
  });
}
