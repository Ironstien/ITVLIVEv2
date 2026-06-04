/**
 * Copy finished art from Badge Images/{filename} → public/img/badges/{id}.png
 * Run: node scripts/sync-badge-images.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG = path.join(ROOT, 'server', 'config', 'badge-catalog.json');
const SRC_DIR = path.join(ROOT, 'Badge Images');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'badges');

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let copied = 0;
  let missing = 0;

  for (const b of catalog) {
    const srcName = b.filename || `${b.id}.png`;
    const srcPath = path.join(SRC_DIR, srcName);
    const destPath = path.join(OUT_DIR, `${b.id}.png`);

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      copied += 1;
    } else {
      missing += 1;
    }
  }

  console.log(`Badge images: ${copied} copied, ${missing} missing (run generate-badge-placeholders for gaps)`);
  console.log(`Output: ${OUT_DIR}`);
}

main();
