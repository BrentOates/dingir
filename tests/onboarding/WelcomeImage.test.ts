import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { render } from '../../src/services/WelcomeImage.ts';
import { fakeMember } from '../fakes/discord.ts';
import { createTestApp } from '../helpers/app.ts';

test('WelcomeImage.render draws avatar with translucent backdrop and thin ring', async (_t) => {
  const app = createTestApp();

  // Create a background canvas (blue)
  const bgCanvas = createCanvas(700, 250);
  const bgCtx = bgCanvas.getContext('2d');
  bgCtx.fillStyle = '#0000ff';
  bgCtx.fillRect(0, 0, 700, 250);
  const bgBuffer = await bgCanvas.encode('png');

  // Create a transparent avatar canvas (256x256, fully transparent)
  const avatarCanvas = createCanvas(256, 256);
  const avatarCtx = avatarCanvas.getContext('2d');
  avatarCtx.clearRect(0, 0, 256, 256);
  const avatarBuffer = await avatarCanvas.encode('png');

  // Start an HTTP server to serve the images
  const server = createServer((req, res) => {
    if (req.url === '/background') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(bgBuffer);
    } else if (req.url === '/avatar') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(avatarBuffer);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  try {
    const { bgUrl, avatarUrl } = await new Promise<{ bgUrl: string; avatarUrl: string }>(
      (resolve, reject) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr === 'object' && addr.port) {
            const port = addr.port;
            resolve({
              bgUrl: `http://127.0.0.1:${port}/background`,
              avatarUrl: `http://127.0.0.1:${port}/avatar`,
            });
          } else {
            reject(new Error('Server did not bind to a port'));
          }
        });
        server.on('error', reject);
      },
    );

    // Create a fake member with displayAvatarURL returning our test avatar
    const member = fakeMember('test-user', {
      displayName: 'Test User',
      joinedTimestamp: Date.now(),
      guild: {
        name: 'Test Guild',
      },
      displayAvatarURL: () => avatarUrl,
    });

    // Render the welcome image
    const attachment = await render(app, member, bgUrl);
    const buffer = attachment.attachment as Buffer;

    // Decode the rendered image
    const canvas = createCanvas(700, 250);
    const ctx = canvas.getContext('2d');
    const image = await loadImage(buffer);
    ctx.drawImage(image, 0, 0);

    // Sample and verify pixels
    const cx = 125;
    const cy = 125;

    // Pixel at avatar center (125, 125): should be backdrop blended over blue
    // backdrop = rgba(0, 0, 0, 0.4), blue = rgb(0, 0, 255)
    // Result: approximately r=0, g=0, b≈153 (255 * 0.6)
    const centerData = ctx.getImageData(cx, cy, 1, 1).data as Uint8ClampedArray;
    assert.ok(
      centerData[2]! < 200 && centerData[2]! > 100,
      `Center pixel blue channel should be ~153 (darkened blue), got ${centerData[2]}`,
    );

    // Pixel at (125 + 77, 125): middle of ring, should be light
    const ringData = ctx.getImageData(cx + 77, cy, 1, 1).data as Uint8ClampedArray;
    assert.ok(
      ringData[0]! > 150 && ringData[1]! > 150,
      `Ring pixel should be light (r > 150, g > 150), got r=${ringData[0]}, g=${ringData[1]}`,
    );

    // Pixel at (125 + 73, 125): just inside ring, should not be light
    const insideData = ctx.getImageData(cx + 73, cy, 1, 1).data as Uint8ClampedArray;
    assert.ok(insideData[0]! < 100, `Inside ring pixel r should be < 100, got ${insideData[0]}`);

    // Pixel at (125 + 83, 125): just outside ring, should be blue background
    const outsideData = ctx.getImageData(cx + 83, cy, 1, 1).data as Uint8ClampedArray;
    assert.ok(
      outsideData[2]! > 230 && outsideData[0]! < 30,
      `Outside ring pixel should be blue (b > 230, r < 30), got b=${outsideData[2]}, r=${outsideData[0]}`,
    );
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    app.close();
  }
});

const serve = async (handler: Parameters<typeof createServer>[1]) => {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}/img`,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
};

const renderFrom = (url: string) =>
  render(
    createTestApp(),
    fakeMember('u', { displayName: 'U', joinedTimestamp: Date.now(), guild: { name: 'G' } }),
    url,
  );

test('render rejects a streamed image over 10 MB without content-length', async () => {
  let written = 0;
  const srv = await serve((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    const chunk = Buffer.alloc(1024 * 1024);
    const timer = setInterval(() => {
      if (res.destroyed || written > 200 * 1024 * 1024) {
        clearInterval(timer);
        return;
      }
      written += chunk.length;
      res.write(chunk);
    }, 1);
    res.on('close', () => clearInterval(timer));
  });
  try {
    const started = Date.now();
    await assert.rejects(renderFrom(srv.url), /larger than 10 MB/);
    assert.ok(Date.now() - started < 5000);
    assert.ok(written < 100 * 1024 * 1024);
  } finally {
    srv.close();
  }
});

test('render rejects a declared content-length over 10 MB', async () => {
  const srv = await serve((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': 11 * 1024 * 1024 });
    res.write(Buffer.alloc(1024));
  });
  try {
    await assert.rejects(renderFrom(srv.url), /larger than 10 MB/);
  } finally {
    srv.close();
  }
});
