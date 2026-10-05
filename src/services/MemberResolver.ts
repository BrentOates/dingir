import { Guild, GuildMember, type GuildTextBasedChannel, type Snowflake, User } from 'discord.js';

const UNKNOWN_MEMBER = 10007;
const UNKNOWN_USER = 10013;

const errorCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;

export const resolveMember = async (
  guild: Guild,
  userOrId: User | Snowflake
): Promise<GuildMember | null> => {
  const id = typeof userOrId === 'string' ? userOrId : userOrId.id;
  const cached = guild.members.cache.get(id);
  if (cached) {
    return cached;
  }
  try {
    return await guild.members.fetch(id);
  } catch (error) {
    const code = errorCode(error);
    if (code === UNKNOWN_MEMBER || code === UNKNOWN_USER) {
      return null;
    }
    throw error;
  }
};

export const resolveTextChannel = async (
  guild: Guild,
  id: Snowflake
): Promise<GuildTextBasedChannel | null> => {
  const channel = guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
  if (!channel || !channel.isTextBased() || channel.isDMBased() || !channel.isSendable()) {
    return null;
  }
  return channel;
};
