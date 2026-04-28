#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const outputDir = resolve('public/icons');
const sizes = [192, 512];

const palette = {
  ink: [16, 32, 39, 255],
  teal: [31, 122, 140, 255],
  mint: [45, 154, 115, 255],
  paper: [245, 247, 246, 255],
  saffron: [196, 124, 33, 255]
};

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    rows[rowOffset] = 0;
    rgba.copy(rows, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND')
  ]);
}

function blend(base, overlay, alpha) {
  return base.map((value, index) => {
    if (index === 3) return 255;
    return Math.round(value * (1 - alpha) + overlay[index] * alpha);
  });
}

function setPixel(buffer, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= width) return;
  const offset = (Math.floor(y) * width + Math.floor(x)) * 4;
  buffer[offset] = color[0];
  buffer[offset + 1] = color[1];
  buffer[offset + 2] = color[2];
  buffer[offset + 3] = color[3];
}

function fillRoundedRect(buffer, width, x, y, w, h, radius, color) {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const left = px < x + radius;
      const right = px >= x + w - radius;
      const top = py < y + radius;
      const bottom = py >= y + h - radius;

      if ((left || right) && (top || bottom)) {
        const cx = left ? x + radius : x + w - radius - 1;
        const cy = top ? y + radius : y + h - radius - 1;
        if ((px - cx) ** 2 + (py - cy) ** 2 > radius ** 2) continue;
      }

      setPixel(buffer, width, px, py, color);
    }
  }
}

function fillDiamond(buffer, width, centerX, centerY, radius, color) {
  for (let py = centerY - radius; py <= centerY + radius; py += 1) {
    for (let px = centerX - radius; px <= centerX + radius; px += 1) {
      if (Math.abs(px - centerX) + Math.abs(py - centerY) <= radius) {
        setPixel(buffer, width, px, py, color);
      }
    }
  }
}

function generateIcon(size) {
  const buffer = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const diagonal = (x + y) / (size * 2);
      const color = blend(palette.teal, palette.ink, diagonal * 0.44);
      setPixel(buffer, size, x, y, color);
    }
  }

  fillRoundedRect(buffer, size, size * 0.16, size * 0.2, size * 0.68, size * 0.48, size * 0.08, palette.paper);
  fillDiamond(buffer, size, size * 0.71, size * 0.72, size * 0.13, palette.mint);
  fillDiamond(buffer, size, size * 0.71, size * 0.72, size * 0.07, palette.paper);
  fillRoundedRect(buffer, size, size * 0.25, size * 0.32, size * 0.34, size * 0.045, size * 0.02, palette.teal);
  fillRoundedRect(buffer, size, size * 0.25, size * 0.43, size * 0.43, size * 0.045, size * 0.02, palette.saffron);
  fillRoundedRect(buffer, size, size * 0.25, size * 0.54, size * 0.25, size * 0.045, size * 0.02, palette.mint);

  return encodePng(size, size, buffer);
}

await mkdir(outputDir, { recursive: true });

for (const size of sizes) {
  const target = resolve(outputDir, `icon-${size}.png`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, generateIcon(size));
  console.log(`Wrote ${target}`);
}
