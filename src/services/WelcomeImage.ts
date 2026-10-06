import path from 'node:path';
import type { GuildMember } from 'discord.js';
import { AttachmentBuilder } from 'discord.js';
import { DateTime } from 'luxon';
import type { Canvas } from '@napi-rs/canvas';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import type { App } from '../app.ts';

const FONT_FAMILY = 'Roboto';
const FONT_PATH = path.join(import.meta.dirname, '..', 'resources', 'fonts', 'Roboto-Regular.ttf');
const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const MIN_FONT_SIZE = 8;
const AVATAR_CENTER = { x: 125, y: 125 };
const AVATAR_RADIUS = 75;
const RING_WIDTH = 5;
const RING_COLOUR = 'rgba(255, 255, 255, 0.7)';
const AVATAR_BACKDROP = 'rgba(0, 0, 0, 0.4)';

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

class DownloadError extends Error {}

const downloadImage = async (url: string): Promise<Buffer> => {
  if (!isHttpUrl(url)) {
    throw new Error('Image URL must start with http:// or https://');
  }
  const tooLarge = () => new DownloadError('The image is larger than 10 MB');
  // One signal covers connecting and reading the whole body.
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      await response.body?.cancel();
      throw new DownloadError(`Could not download the image (HTTP ${response.status})`);
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) {
      await response.body?.cancel();
      throw tooLarge();
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.length;
      if (total > MAX_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof DownloadError) {
      throw error;
    }
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error(
        `Downloading the image timed out after ${DOWNLOAD_TIMEOUT_MS / 1000} seconds`,
        { cause: error },
      );
    }
    throw new Error(
      `Could not download the image: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
};

export type WelcomeImageRenderer = (
  app: App,
  member: GuildMember,
  backgroundUrl: string,
) => Promise<AttachmentBuilder>;

export const render: WelcomeImageRenderer = async (app, member, backgroundUrl) => {
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
  const joined = DateTime.fromMillis(member.joinedTimestamp, {
    zone: app.env.timezone,
  }).toLocaleString(DateTime.DATE_FULL);
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

  const cx = AVATAR_CENTER.x;
  const cy = AVATAR_CENTER.y;
  const r = AVATAR_RADIUS;

  // Create a clipping region for the avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // Fill the clipped region with backdrop
  ctx.fillStyle = AVATAR_BACKDROP;
  ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);

  // Draw the avatar
  const avatar = await loadImage(member.displayAvatarURL({ extension: 'png', size: 256 }));
  ctx.drawImage(avatar, cx - r, cy - r, 2 * r, 2 * r);

  ctx.restore();

  // Draw the ring outside the clipped region
  ctx.beginPath();
  ctx.arc(cx, cy, r + RING_WIDTH / 2, 0, Math.PI * 2);
  ctx.strokeStyle = RING_COLOUR;
  ctx.lineWidth = RING_WIDTH;
  ctx.stroke();

  return new AttachmentBuilder(await canvas.encode('png')).setName('welcome-image.png');
};

export const WelcomeImage = { render };
