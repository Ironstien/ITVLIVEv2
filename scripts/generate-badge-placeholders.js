/**
 * Generates void-themed placeholder badge PNGs (minimal flat circles + symbol).
 * Run: node scripts/generate-badge-placeholders.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BADGE_IDS = [
  'account_created',
  'first_listen',
  'first_vote',
  'first_dj_play',
  'first_playlist',
  'queue_joined',
  'listener_10',
  'listener_50',
  'voter_10',
  'voter_50',
  'dj_5',
  'dj_25',
  'level_5',
  'level_10',
  'playlist_25_tracks',
  'two_playlists',
  'listener_200',
  'dj_50',
  'level_20',
  'level_30',
  'avg_score_70',
  'avg_score_85',
];

const TIER_RIM = {
  account_created: 1,
  first_listen: 1,
  first_vote: 1,
  first_dj_play: 1,
  first_playlist: 1,
  queue_joined: 1,
  listener_10: 2,
  listener_50: 2,
  voter_10: 2,
  voter_50: 2,
  dj_5: 2,
  dj_25: 2,
  level_5: 2,
  level_10: 2,
  playlist_25_tracks: 2,
  two_playlists: 2,
  listener_200: 3,
  dj_50: 3,
  level_20: 3,
  level_30: 3,
  avg_score_70: 3,
  avg_score_85: 3,
};

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
  if (tier >= 3) {
    return { bg: [14, 12, 20], rim: [155, 93, 229], accent: [255, 107, 53], inner: [123, 44, 191] };
  }
  if (tier >= 2) {
    return { bg: [14, 12, 20], rim: [123, 44, 191], accent: [155, 93, 229], inner: [90, 24, 154] };
  }
  return { bg: [14, 12, 20], rim: [90, 24, 154], accent: [123, 44, 191], inner: [74, 28, 120] };
}

function hashHue(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function renderBadgePng(id) {
  const tier = TIER_RIM[id] || 1;
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
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'public', 'img', 'badges');
fs.mkdirSync(outDir, { recursive: true });

for (const id of BADGE_IDS) {
  const outPath = path.join(outDir, `${id}.png`);
  fs.writeFileSync(outPath, renderBadgePng(id));
  console.log('wrote', outPath);
}

console.log(`Done — ${BADGE_IDS.length} badge PNGs in public/img/badges/`);
