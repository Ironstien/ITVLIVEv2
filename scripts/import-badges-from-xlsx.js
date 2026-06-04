/**
 * Import Badges.xlsx → server/config/badge-catalog.json + docs/BADGE_UNLOCK_RULES.md
 * Run: node scripts/import-badges-from-xlsx.js [path-to-xlsx]
 */
const fs = require('fs');
const path = require('path');
const {
  loadBadgesFromXlsx,
  classifyUnlockType,
  NEEDS_REVIEW,
} = require('./lib/parse-badges-xlsx');

const ROOT = path.join(__dirname, '..');
const CATALOG_OUT = path.join(ROOT, 'server', 'config', 'badge-catalog.json');
const RULES_OUT = path.join(ROOT, 'docs', 'BADGE_UNLOCK_RULES.md');

function buildRulesMarkdown(badges) {
  const lines = [
    '# Badge unlock rules (review)',
    '',
    'Generated from **Badges.xlsx**. Edit this file to correct rules; implementation in `server/config/badges.js` follows these definitions.',
    '',
    '**Implementation defaults for ambiguous badges:**',
    '- Streaks and night window: **UTC** calendar dates; night owl = listens when hour is 0–3 UTC.',
    '- `first_in_pit`: first voter on a track **10** separate times (lifetime counter).',
    '- `perfect_match`: vote within **1 point** of session final average, **5** times.',
    '- `warm_up_act` / `peak_time_dj`: online listener count at **track start**.',
    '- `b2b_dj`: **5** consecutive Main Stage plays by the same DJ.',
    '',
    '| Review? | ID | Name | Tier | Unlock rule | Impl. type |',
    '|---------|-----|------|------|-------------|------------|',
  ];

  for (const b of badges) {
    const review = NEEDS_REVIEW.has(b.id) ? '**YES**' : '';
    const unlockType = classifyUnlockType(b);
    const rule = String(b.unlock || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| ${review} | \`${b.id}\` | ${b.name} | ${b.tier} | ${rule} | ${unlockType} |`);
  }

  lines.push('');
  lines.push(`Total badges: **${badges.length}**`);
  return lines.join('\n');
}

function main() {
  const custom = process.argv[2];
  const { path: xlsxPath, badges } = loadBadgesFromXlsx(custom);

  const catalog = badges.map((b) => ({
    id: b.id,
    name: b.name,
    tier: b.tier,
    description: b.description,
    image: b.image,
    filename: b.filename,
    category: b.category,
    unlockType: classifyUnlockType(b),
    autoGrant: classifyUnlockType(b) !== 'manual',
  }));

  fs.mkdirSync(path.dirname(CATALOG_OUT), { recursive: true });
  fs.mkdirSync(path.dirname(RULES_OUT), { recursive: true });
  fs.writeFileSync(CATALOG_OUT, JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(RULES_OUT, buildRulesMarkdown(badges) + '\n');

  console.log(`Imported ${catalog.length} badges from ${xlsxPath}`);
  console.log(`Wrote ${CATALOG_OUT}`);
  console.log(`Wrote ${RULES_OUT}`);
}

main();
