import {
  APIEmbed,
  Attachment,
  AttachmentBuilder,
  AttachmentPayload,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  GuildMember,
  InteractionContextType,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  MessageFlags,
  MessageMentionOptions,
  PermissionFlagsBits,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
} from 'discord.js';
import type { ServerConfig } from '../client/models/ServerConfig';

export type DeferMode = 'ephemeral' | 'public' | false;

export interface ReplyOptions {
  content?: string;
  embeds?: APIEmbed[] | EmbedBuilder[];
  files?: AttachmentPayload[] | AttachmentBuilder[] | Attachment[];
  allowedMentions?: MessageMentionOptions;
  ephemeral?: boolean;
}

export interface CommandContext {
  interaction: ChatInputCommandInteraction<'cached'>;
  guild: Guild;
  member: GuildMember;
  config: ServerConfig;
  reply(response: string | ReplyOptions): Promise<void>;
}

export type Handler = (ctx: CommandContext) => Promise<void>;

export interface SubcommandDefinition {
  name: string;
  description: string;
  defer?: DeferMode;
  options?: (b: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
  run: Handler;
}

export interface SubcommandGroupDefinition {
  name: string;
  description: string;
  subcommands: SubcommandDefinition[];
}

export interface CommandDefinition {
  name: string;
  description: string;
  adminOnly?: boolean;
  defer?: DeferMode;
  options?: (b: SlashCommandOptionsOnlyBuilder) => SlashCommandOptionsOnlyBuilder;
  run?: Handler;
  subcommands?: SubcommandDefinition[];
  groups?: SubcommandGroupDefinition[];
}

export interface ResolvedCommand {
  run: Handler;
  defer: DeferMode;
  /** Human-readable path such as "config welcome set", used for logging. */
  path: string;
}

export interface Command {
  name: string;
  toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
  resolve(interaction: ChatInputCommandInteraction): ResolvedCommand | undefined;
}

export function buildReplyPayload(
  response: string | ReplyOptions
): Omit<ReplyOptions, 'ephemeral'> & { flags?: MessageFlags.Ephemeral } {
  const { ephemeral = true, ...rest } =
    typeof response === 'string' ? { content: response } : response;
  return ephemeral ? { ...rest, flags: MessageFlags.Ephemeral } : rest;
}

/** Replies, edits the deferred reply, or follows up depending on the interaction's state. */
export function createReply(interaction: ChatInputCommandInteraction): CommandContext['reply'] {
  return async (response) => {
    const payload = buildReplyPayload(response);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply(payload as InteractionReplyOptions);
    } else if (interaction.deferred && !interaction.replied) {
      // The ephemeral flag is fixed when deferring and cannot be changed by an edit
      const edit: Omit<typeof payload, 'flags'> & { flags?: unknown } = { ...payload };
      delete edit.flags;
      await interaction.editReply(edit as InteractionEditReplyOptions);
    } else {
      await interaction.followUp(payload as InteractionReplyOptions);
    }
  };
}

const assertUnique = (kind: string, where: string, names: string[]): void => {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      throw new Error(`Duplicate ${kind} name "${name}" in ${where}`);
    }
    seen.add(name);
  }
};

const subcommandBuilder =
  (def: SubcommandDefinition) =>
  (b: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder => {
    const named = b.setName(def.name).setDescription(def.description);
    return def.options ? def.options(named) : named;
  };

export function defineCommand(def: CommandDefinition): Command {
  const where = `command "${def.name}"`;
  const hasSubs = (def.subcommands?.length ?? 0) > 0;
  const hasGroups = (def.groups?.length ?? 0) > 0;
  const isLeaf = def.run !== undefined;

  if (isLeaf && (hasSubs || hasGroups)) {
    throw new Error(`${where} cannot define both run and subcommands/groups`);
  }
  if (!isLeaf && !hasSubs && !hasGroups) {
    throw new Error(`${where} must define either run or subcommands/groups`);
  }
  if (!isLeaf && (def.options || def.defer !== undefined)) {
    throw new Error(`${where} sets options/defer but is not a leaf command; set them on subcommands`);
  }

  assertUnique('subcommand/group', where, [
    ...(def.subcommands ?? []).map((s) => s.name),
    ...(def.groups ?? []).map((g) => g.name),
  ]);

  const routes = new Map<string, ResolvedCommand>();
  const routeKey = (group: string | null, sub: string | null): string =>
    `${group ?? ''}/${sub ?? ''}`;

  let builder = new SlashCommandBuilder()
    .setName(def.name)
    .setDescription(def.description)
    .setContexts([InteractionContextType.Guild]);

  if (def.adminOnly) {
    builder = builder.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  }

  if (def.run) {
    if (def.options) {
      builder = def.options(builder) as unknown as SlashCommandBuilder;
    }
    routes.set(routeKey(null, null), { run: def.run, defer: def.defer ?? false, path: def.name });
  }

  for (const sub of def.subcommands ?? []) {
    builder.addSubcommand(subcommandBuilder(sub));
    routes.set(routeKey(null, sub.name), {
      run: sub.run,
      defer: sub.defer ?? false,
      path: `${def.name} ${sub.name}`,
    });
  }

  for (const group of def.groups ?? []) {
    const groupWhere = `group "${group.name}" in ${where}`;
    if (group.subcommands.length === 0) {
      throw new Error(`${groupWhere} must define at least one subcommand`);
    }
    assertUnique(
      'subcommand',
      groupWhere,
      group.subcommands.map((s) => s.name)
    );
    builder.addSubcommandGroup((g: SlashCommandSubcommandGroupBuilder) => {
      g.setName(group.name).setDescription(group.description);
      for (const sub of group.subcommands) {
        g.addSubcommand(subcommandBuilder(sub));
        routes.set(routeKey(group.name, sub.name), {
          run: sub.run,
          defer: sub.defer ?? false,
          path: `${def.name} ${group.name} ${sub.name}`,
        });
      }
      return g;
    });
  }

  // Building the JSON now surfaces invalid names, descriptions and options at definition time
  let json: RESTPostAPIChatInputApplicationCommandsJSONBody;
  try {
    json = builder.toJSON();
  } catch (error) {
    throw new Error(
      `Invalid ${where}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  return {
    name: def.name,
    toJSON: () => json,
    resolve: (interaction) =>
      routes.get(
        routeKey(
          interaction.options.getSubcommandGroup(false),
          interaction.options.getSubcommand(false)
        )
      ),
  };
}

export function defineSubcommandGroup(def: SubcommandGroupDefinition): SubcommandGroupDefinition {
  return def;
}
