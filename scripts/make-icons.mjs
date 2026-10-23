import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icon');

const TOP = [0xff, 0xd8, 0x4a];
const BOTTOM = [0xf5, 0xb4, 0x00];
const INK = [0x2b, 0x21, 0x00];
const BOWL = { cx: 16, cy: 13.5, outer: 6.5, inner: 3.3 };
const STEM = { x: 9.5, y: 7, width: 3.2, height: 18 };
const UNDERLINE = { x: 14.9, y: 22.6, width: 8, height: 2.6 };
const SAMPLES = 5;

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function inSquircle(x, y) {
  const dx = Math.abs(x - 16) / 16;
  const dy = Math.abs(y - 16) / 16;
  return dx ** 5 + dy ** 5 <= 1;
}

function inCapsule(x, y, box) {
  const radius = Math.min(box.width, box.height) / 2;
  const cx = Math.min(Math.max(x, box.x + radius), box.x + box.width - radius);
  const cy = Math.min(Math.max(y, box.y + radius), box.y + box.height - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function inGlyph(x, y) {
  const distance = Math.hypot(x - BOWL.cx, y - BOWL.cy);
  if (distance <= BOWL.outer && distance >= BOWL.inner) return true;
  return inCapsule(x, y, STEM) || inCapsule(x, y, UNDERLINE);
}

function png(size) {
  const pad = size >= 128 ? size * 0.125 : size >= 48 ? size * 0.04 : 0;
  const scale = (size - pad * 2) / 32;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py += 1) {
    const row = py * (size * 4 + 1);
    raw[row] = 0;
    for (let px = 0; px < size; px += 1) {
      let covered = 0;
      let ink = 0;
      let shade = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px + (sx + 0.5) / SAMPLES - pad) / scale;
          const y = (py + (sy + 0.5) / SAMPLES - pad) / scale;
          if (!inSquircle(x, y)) continue;
          covered += 1;
          shade += Math.min(Math.max(y / 32, 0), 1);
          if (inGlyph(x, y)) ink += 1;
        }
      }
      const pixel = row + 1 + px * 4;
      if (!covered) continue;
      const t = shade / covered;
      const mix = ink / covered;
      for (let channel = 0; channel < 3; channel += 1) {
        const base = TOP[channel] + (BOTTOM[channel] - TOP[channel]) * t;
        raw[pixel + channel] = Math.round(base + (INK[channel] - base) * mix);
      }
      raw[pixel + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(root, { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(join(root, `${size}.png`), png(size));
