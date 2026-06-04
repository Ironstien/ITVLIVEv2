/**
 * Generates void-themed placeholder badge PNGs for missing catalog images.
 * Run: node scripts/generate-badge-placeholders.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const CATALOG = path.join(ROOT, 'server', 'config', 'badge-catalog.json');
const outDir = path.join(ROOT, 'public', 'img', 'badges');

const SIZE = 128;

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function tierColors(tier) {
  if (tier >= 6) {
    return { bg: [14, 12, 20], rim: [245, 220, 224], accent: [245, 220, 224], inner: [180, 120, 140] };
  }
  if (tier >= 5) {
    return { bg: [14, 12, 20], rim: [255, 215, 0], accent: [255, 107, 53], inner: [200, 140, 40] };
  }
  if (tier >= 4) {
    return { bg: [14, 12, 20], rim: [255, 128, 0], accent: [255, 107, 53], inner: [180, 80, 30] };
  }
  if (tier >= 3) {
    return { bg: [14, 12, 20], rim: [0, 112, 221], accent: [46, 196, 182], inner: [30, 80, 160] };
  }
  if (tier >= 2) {
    return { bg: [14, 12, 20], rim: [30, 255, 0], accent: [123, 44, 191], inner: [20, 120, 40] };
  }
  return { bg: [14, 12, 20], rim: [255, 255, 255], accent: [155, 93, 229], inner: [90, 24, 154] };
}

function hashHue(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function renderBadgePng(id, tier) {
  const { bg, rim, accent, inner } = tierColors(tier);
  const hue = hashHue(id);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const outerR = 58;
  const rimR = 52;
  const innerR = 38;

  const rows = [];
  for (let y = 0; y < SIZE; y++) {
    const row = Buffer.alloc(1 + SIZE * 4);
    row[0] = 0;
    for (let x = 0; x < SIZE; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const o = (y * SIZE + x) * 4 + 1;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (d <= outerR) {
        if (d > rimR) {
          [r, g, b] = rim;
          a = 255;
        } else if (d > innerR) {
          [r, g, b] = bg;
          a = 255;
        } else {
          const angle = Math.atan2(dy, dx);
          const spoke = Math.abs(Math.sin(angle * 3 + (hue * Math.PI) / 180));
          r = Math.round(inner[0] * (1 - spoke * 0.3) + accent[0] * spoke * 0.3);
          g = Math.round(inner[1] * (1 - spoke * 0.3) + accent[1] * spoke * 0.3);
          b = Math.round(inner[2] * (1 - spoke * 0.3) + accent[2] * spoke * 0.3);
          a = 255;
        }
      }

      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
      row[o + 3] = a;
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });

  let wrote = 0;
  let skipped = 0;

  for (const b of catalog) {
    const outPath = path.join(outDir, `${b.id}.png`);
    if (fs.existsSync(outPath)) {
      skipped += 1;
      continue;
    }
    fs.writeFileSync(outPath, renderBadgePng(b.id, b.tier || 1));
    wrote += 1;
    console.log('placeholder', b.id);
  }

  console.log(`Done — ${wrote} placeholders written, ${skipped} existing kept in public/img/badges/`);
}

main();
