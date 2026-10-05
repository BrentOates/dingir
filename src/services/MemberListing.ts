import type { GuildMember } from 'discord.js';
import { AttachmentBuilder } from 'discord.js';
import { DateTime } from 'luxon';
import type { ReplyOptions } from '../framework/command.ts';

export const INLINE_LIMIT = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

const byJoinDate = (a: GuildMember, b: GuildMember): number =>
  (a.joinedTimestamp ?? Infinity) - (b.joinedTimestamp ?? Infinity);

const inlineLine = (member: GuildMember): string =>
  member.joinedTimestamp === null
    ? `<@${member.id}> join date unknown`
    : `<@${member.id}> joined <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`;

const fileLine = (member: GuildMember): string =>
  `${member.user.username} (${member.id}) — ${
    member.joinedTimestamp === null
      ? 'join date unknown'
      : `joined ${DateTime.fromMillis(member.joinedTimestamp, { zone: 'utc' }).toISODate()}`
  }`;

export const wholeDaysSinceJoin = (member: GuildMember, now: number): number | null => {
  if (member.joinedTimestamp === null) {
    return null;
  }
  const joined = DateTime.fromMillis(member.joinedTimestamp, { zone: 'utc' }).startOf('day');
  const today = DateTime.fromMillis(now, { zone: 'utc' }).startOf('day');
  return Math.floor((today.toMillis() - joined.toMillis()) / DAY_MS);
};

export const buildMemberListing = (
  header: string,
  emptyMessage: string,
  members: GuildMember[]
): ReplyOptions => {
  if (members.length === 0) {
    return { content: emptyMessage, allowedMentions: { parse: [] } };
  }
  const sorted = [...members].sort(byJoinDate);
  const inline = `${header}\n------\n${sorted.map(inlineLine).join('\n')}`;
  if (inline.length <= INLINE_LIMIT) {
    return { content: inline, allowedMentions: { parse: [] } };
  }
  const file = new AttachmentBuilder(Buffer.from(sorted.map(fileLine).join('\n'), 'utf8'), {
    name: 'members.txt',
  });
  return {
    content: `${header}\n${sorted.length} members matched; the full list is attached.`,
    files: [file],
    allowedMentions: { parse: [] },
  };
};
