import { AttachmentBuilder, Client, Guild, GuildMember, type PartialGuildMember, Role } from 'discord.js';
import type { ServerConfig } from '../client/database/schema.ts';
import { EmbedColours } from '../resources/EmbedColours.ts';
import { Logger } from '../utilities/Logger.ts';
import { AuditEmbed } from './AuditEmbed.ts';
import { sendAudit } from './AuditService.ts';
import { WelcomeImage, type WelcomeImageRenderer } from './WelcomeImage.ts';

/** 'done' | 'skipped:<reason>' | 'failed:<message>' */
export type StepResult = string;

export interface WelcomePayload {
  content?: string;
  image?: AttachmentBuilder;
  imageError?: string;
}

export interface RoleSkip {
  id: string;
  reason: string;
}

export interface OnboardingResult {
  dryRun: boolean;
  audit: StepResult;
  roles: StepResult;
  welcome: StepResult;
  debug: StepResult;
  rolesAdded: string[];
  rolesSkipped: RoleSkip[];
  welcomePayload?: WelcomePayload;
}

export interface OnboardingDeps {
  renderImage?: WelcomeImageRenderer;
}

export interface OnboardingOptions {
  dryRun?: boolean;
}

const MAX_ERROR_LENGTH = 200;

const messageOf = (error: unknown): string => {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH)}…` : text;
};

/** Returns why the bot could not hand out this role, or null when it can. */
export const roleProblem = (guild: Guild, role: Role): string | null => {
  if (role.id === guild.id) {
    return '@everyone cannot be assigned';
  }
  if (role.managed) {
    return 'managed by an integration';
  }
  const me = guild.members.me;
  if (!me) {
    return 'bot member unavailable';
  }
  if (role.position >= me.roles.highest.position) {
    return 'at or above the bot\'s highest role';
  }
  return null;
};

export const parseRoleIds = (raw: string | null | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');

/** True only when a member is known to have just passed membership screening. */
export const completedScreening = (
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember | PartialGuildMember
): boolean => oldMember.pending === true && newMember.pending === false;

export const formatOnboardingSummary = (result: OnboardingResult): string => {
  const lines = [
    `Audit: ${result.audit}`,
    `Guest roles: ${result.roles}`,
    `Welcome message: ${result.welcome}`,
  ];
  if (result.rolesAdded.length > 0) {
    lines.push(`${result.dryRun ? 'Would add' : 'Added'}: ${result.rolesAdded.map((id) => `<@&${id}>`).join(', ')}`);
  }
  for (const skip of result.rolesSkipped) {
    lines.push(`Skipped role ${skip.id}: ${skip.reason}`);
  }
  return lines.join('\n');
};

export const auditJoin = (client: Client, member: GuildMember, config: ServerConfig): Promise<boolean> =>
  sendAudit(
    client,
    config,
    AuditEmbed.forMember(member, EmbedColours.positive, 'New member joined').addField('ID', member.id)
  );

const auditFailure = (
  client: Client,
  member: GuildMember,
  config: ServerConfig,
  description: string,
  detail: string
): Promise<boolean> =>
  sendAudit(
    client,
    config,
    AuditEmbed.forMember(member, EmbedColours.negative, description)
      .addField('ID', member.id)
      .addField('Reason', detail)
  );

async function runStep(
  name: string,
  member: GuildMember,
  step: () => Promise<StepResult>
): Promise<StepResult> {
  try {
    return await step();
  } catch (error) {
    Logger.error(`Onboarding step failed: ${name}`, { guild: member.guild.id, member: member.id }, error);
    return `failed:${messageOf(error)}`;
  }
}

async function addGuestRoles(
  client: Client,
  member: GuildMember,
  config: ServerConfig,
  dryRun: boolean,
  result: OnboardingResult
): Promise<StepResult> {
  const ids = parseRoleIds(config.guestRoleIds);
  if (ids.length === 0) {
    return 'skipped:no guest roles configured';
  }
  const { guild } = member;
  const assignable: Role[] = [];
  for (const id of ids) {
    const role = guild.roles.cache.get(id) ?? (await guild.roles.fetch(id).catch(() => null));
    if (!role) {
      result.rolesSkipped.push({ id, reason: 'role no longer exists' });
      continue;
    }
    const problem = roleProblem(guild, role);
    if (problem) {
      result.rolesSkipped.push({ id, reason: problem });
      continue;
    }
    assignable.push(role);
  }
  result.rolesAdded = assignable.map((r) => r.id);
  if (assignable.length === 0) {
    return 'skipped:no assignable guest roles';
  }
  if (dryRun) {
    return 'skipped:dry run';
  }
  try {
    await member.roles.add(assignable.map((r) => r.id));
  } catch (error) {
    result.rolesAdded = [];
    await auditFailure(
      client,
      member,
      config,
      'Unable to provide guest role(s) to member.',
      messageOf(error)
    );
    throw error;
  }
  return 'done';
}

async function sendWelcome(
  client: Client,
  member: GuildMember,
  config: ServerConfig,
  dryRun: boolean,
  result: OnboardingResult,
  renderImage: WelcomeImageRenderer
): Promise<StepResult> {
  const text = config.welcomeMessage ?? '';
  const url = config.welcomeMessageBackgroundUrl;
  if (!config.systemMessagesEnabled) {
    return 'skipped:system messages are disabled';
  }
  if (text === '' && !url) {
    return 'skipped:no welcome message or image configured';
  }
  const channel = member.guild.systemChannel;
  if (!channel) {
    return 'skipped:server has no system channel';
  }

  const payload: WelcomePayload = {};
  if (text !== '') {
    payload.content = text.replaceAll('{member}', `<@${member.id}>`);
  }
  if (url) {
    try {
      payload.image = await renderImage(member, url);
    } catch (error) {
      payload.imageError = messageOf(error);
      Logger.warn('Welcome image failed', { guild: member.guild.id, member: member.id }, error);
      if (!dryRun) {
        await auditFailure(client, member, config, 'Unable to generate welcome image.', payload.imageError);
      }
    }
  }
  if (payload.content === undefined && !payload.image) {
    throw new Error(`Welcome image failed: ${payload.imageError ?? 'unknown error'}`);
  }

  result.welcomePayload = payload;
  if (dryRun) {
    return 'skipped:dry run';
  }
  try {
    await channel.send({
      content: payload.content,
      files: payload.image ? [payload.image] : undefined,
      allowedMentions: { users: [member.id] },
    });
  } catch (error) {
    await auditFailure(client, member, config, 'Unable to send welcome message.', messageOf(error));
    throw error;
  }
  return 'done';
}

export async function complete(
  client: Client,
  member: GuildMember,
  config: ServerConfig,
  options: OnboardingOptions = {},
  deps: OnboardingDeps = {}
): Promise<OnboardingResult> {
  const dryRun = options.dryRun ?? false;
  const renderImage = deps.renderImage ?? WelcomeImage.render;
  const result: OnboardingResult = {
    dryRun,
    audit: 'skipped:dry run',
    roles: '',
    welcome: '',
    debug: 'skipped:debug is disabled',
    rolesAdded: [],
    rolesSkipped: [],
  };

  if (!dryRun) {
    result.audit = await runStep('audit', member, async () => {
      const sent = await sendAudit(
        client,
        config,
        AuditEmbed.forMember(member, EmbedColours.neutral, 'Member completed onboarding').addField(
          'ID',
          member.id
        )
      );
      return sent ? 'done' : 'skipped:no usable audit channel';
    });
  }

  result.roles = await runStep('roles', member, () =>
    addGuestRoles(client, member, config, dryRun, result)
  );
  result.welcome = await runStep('welcome', member, () =>
    sendWelcome(client, member, config, dryRun, result, renderImage)
  );

  if (config.debug && !dryRun) {
    result.debug = await runStep('debug', member, async () => {
      const sent = await sendAudit(
        client,
        config,
        AuditEmbed.forMember(member, EmbedColours.info, 'Onboarding diagnostics')
          .addField('ID', member.id)
          .addField('Steps', formatOnboardingSummary(result))
      );
      return sent ? 'done' : 'skipped:no usable audit channel';
    });
  } else if (config.debug) {
    result.debug = 'skipped:dry run';
  }

  return result;
}

export const OnboardingService = { complete };
