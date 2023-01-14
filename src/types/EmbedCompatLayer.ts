import { EmbedBuilder } from 'npm:discord.js';

export class EmbedCompatLayer extends EmbedBuilder {
  public addField(name: string, value: string): EmbedCompatLayer {
    this.addFields([
      {
        name: name,
        value: value,
      },
    ]);

    return this;
  }
}
