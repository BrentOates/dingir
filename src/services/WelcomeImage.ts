import path from 'node:path';
import { AttachmentBuilder, GuildMember } from 'discord.js';
import { DateTime } from 'luxon';
import { Canvas, createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { env } from '../config/env.ts';

const FONT_FAMILY = 'Roboto';
const FONT_PATH = path.join(import.meta.dirname, '..', 'resources', 'fonts', 'Roboto-Regular.ttf');
const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const MIN_FONT_SIZE = 8;

let fontRegistered = false;
const ensureFont = (): void => {
  if (!fontRegistered) {
    GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
    fontRegistered = true;
  }
};

export const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export const applyText = (canvas: Canvas, text: string, baseSize: number): string => {
  const ctx = canvas.getContext('2d');
  let fontSize = baseSize;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  while (fontSize > MIN_FONT_SIZE && ctx.measureText(text).width > canvas.width - 300) {
    fontSize -= 1;
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  }
  return ctx.font;
};

const downloadImage = async (url: string): Promise<Buffer> => {
  if (!isHttpUrl(url)) {
    throw new Error('Image URL must start with http:// or https://');
  }
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error(`Downloading the image timed out after ${DOWNLOAD_TIMEOUT_MS / 1000} seconds`, {
        cause: error,
      });
    }
    throw new Error(
      `Could not download the image: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  if (!response.ok) {
    throw new Error(`Could not download the image (HTTP ${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_DOWNLOAD_BYTES) {
    throw new Error('The image is larger than 10 MB');
  }
  return buffer;
};

export type WelcomeImageRenderer = (
  member: GuildMember,
  backgroundUrl: string
) => Promise<AttachmentBuilder>;

export const render: WelcomeImageRenderer = async (member, backgroundUrl) => {
  ensureFont();
  if (member.joinedTimestamp === null) {
    throw new Error(`Join date unavailable for member ${member.id}`);
  }

  const data = await downloadImage(backgroundUrl);
  let background;
  try {
    background = await loadImage(data);
  } catch (error) {
    throw new Error('The URL did not return a valid image', { cause: error });
  }

  const canvas = createCanvas(700, 250);
  const ctx = canvas.getContext('2d');
  const joined = DateTime.fromMillis(member.joinedTimestamp, { zone: env.timezone }).toLocaleString(
    DateTime.DATE_FULL
  );
  const name = member.displayName;
  const welcome = `Welcome to ${member.guild.name}!`;
  const joinedText = `Joined: ${joined}`;

  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';

  ctx.font = applyText(canvas, name, 48);
  ctx.fillText(name, 225, 125);
  ctx.font = applyText(canvas, welcome, 34);
  ctx.fillText(welcome, 225, 160);
  ctx.font = applyText(canvas, joinedText, 20);
  ctx.fillText(joinedText, 225, 200);

  ctx.beginPath();
  ctx.arc(125, 125, 75, 0, Math.PI * 2, true);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.closePath();
  ctx.clip();

  const avatar = await loadImage(member.displayAvatarURL({ extension: 'png', size: 256 }));
  ctx.drawImage(avatar, 50, 50, 150, 150);

  return new AttachmentBuilder(await canvas.encode('png')).setName('welcome-image.png');
};

export const WelcomeImage = { render };
