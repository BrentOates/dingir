import { ColorResolvable } from 'discord.js';

interface EmbedColors {
  [key: string]: ColorResolvable;
}

export const EmbedColours: EmbedColors = {
  positive: '#30d70c',
  negative: '#de2525',
  neutral: '#cc37f1',
  info: '#30bcf6',
};
