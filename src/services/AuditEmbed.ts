import type { GuildMember } from 'discord.js';
import { type ColorResolvable, EmbedBuilder, User } from 'discord.js';

const LIMITS = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  total: 6000,
};
const ELLIPSIS = '…';
const EMPTY_VALUE = '*(empty)*';
const NOTE_NAME = 'Truncated';
const NOTE_VALUE = 'Some content was omitted to fit Discord limits.';

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(0, max - ELLIPSIS.length))}${ELLIPSIS}`;

export class AuditEmbed extends EmbedBuilder {
  private cut = false;
  private storedFields = 0;

  public override setTitle(title: string | null): this {
    return super.setTitle(title === null ? null : this.limit(title, LIMITS.title));
  }

  public override setDescription(description: string | null): this {
    return super.setDescription(
      description === null ? null : this.limit(description, LIMITS.description),
    );
  }

  public addField(name: string, value: string, inline = false): this {
    if (this.storedFields >= LIMITS.fields) {
      this.cut = true;
      return this;
    }
    const safeName = this.limit(name.trim() === '' ? '​' : name, LIMITS.fieldName);
    const safeValue = value.trim() === '' ? EMPTY_VALUE : this.limit(value, LIMITS.fieldValue);
    this.addFields([{ name: safeName, value: safeValue, inline }]);
    this.storedFields += 1;
    return this;
  }

  public override toJSON(): ReturnType<EmbedBuilder['toJSON']> {
    const data = super.toJSON();
    const fields = [...(data.fields ?? [])];
    const textLength = (): number =>
      (data.title?.length ?? 0) +
      (data.description?.length ?? 0) +
      (data.author?.name.length ?? 0) +
      (data.footer?.text.length ?? 0);
    const fieldsLength = (list: typeof fields): number =>
      list.reduce((sum, f) => sum + f.name.length + f.value.length, 0);
    const noteLength = NOTE_NAME.length + NOTE_VALUE.length;

    let truncated = this.cut;
    let kept = fields;
    if (textLength() + fieldsLength(fields) > LIMITS.total) {
      truncated = true;
    }
    if (truncated) {
      kept = fields.slice(0, LIMITS.fields - 1);
      while (kept.length > 0 && textLength() + fieldsLength(kept) + noteLength > LIMITS.total) {
        kept.pop();
      }
      const excess = textLength() + noteLength - LIMITS.total;
      if (excess > 0 && data.description) {
        data.description = truncate(data.description, data.description.length - excess);
      }
      kept.push({ name: NOTE_NAME, value: NOTE_VALUE, inline: false });
    }
    return { ...data, fields: kept.length > 0 ? kept : undefined };
  }

  private limit(text: string, max: number): string {
    if (text.length > max) {
      this.cut = true;
    }
    return truncate(text, max);
  }
}

export function memberAuditEmbed(
  member: GuildMember | User,
  colour: ColorResolvable,
  description: string,
): AuditEmbed {
  const user = member instanceof User ? member : member.user;
  const name = member.displayName || user.tag;
  return new AuditEmbed()
    .setColor(colour)
    .setAuthor({ name: truncate(name, LIMITS.fieldName), iconURL: member.displayAvatarURL() })
    .setDescription(description)
    .setTimestamp();
}
