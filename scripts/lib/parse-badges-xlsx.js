/**
 * Parse Badges.xlsx via Python (column I = slug id, G = unlock, L = filename).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_XLSX = path.join(__dirname, '..', '..', 'Badges.xlsx');
const DEFAULT_XLSX = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'Badges.xlsx'
);

const PARSE_PY = path.join(__dirname, 'parse-badges-xlsx.py');

function resolveXlsxPath(customPath) {
  if (customPath && fs.existsSync(customPath)) return customPath;
  if (fs.existsSync(PROJECT_XLSX)) return PROJECT_XLSX;
  if (fs.existsSync(DEFAULT_XLSX)) return DEFAULT_XLSX;
  return customPath || DEFAULT_XLSX;
}

function loadBadgesFromXlsx(xlsxPath) {
  const resolved = resolveXlsxPath(xlsxPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Badges.xlsx not found at ${resolved}`);
  }

  const raw = execFileSync('python', [PARSE_PY, resolved], { encoding: 'utf8' });
  const badges = JSON.parse(raw.trim());
  return { path: resolved, badges };
}

function classifyUnlockType(badge) {
  const { id, tier, unlock } = badge;
  const u = String(unlock || '').toLowerCase();

  if (
    tier >= 6 &&
    (u.includes('??') || id === 'ally_approved' || id === 'freddy_approved' || id === 'axolotl_drummer')
  ) {
    return 'manual';
  }
  if (/mention.*chat|chat.*mention|send first chat|send \d+ chat/i.test(unlock)) return 'chat-hook';
  if (/click a username|view another user|profile viewed/i.test(u)) return 'profile-hook';
  if (/consecutive day|midnight|4am|streak|without missing a vote/i.test(u)) return 'streak';
  if (
    /play session|votecount|aggregate avg|every vote score|same dj|room has|people listening|first person to vote|following the same dj|votes of 90/i.test(
      u
    )
  ) {
    return 'session-hook';
  }
  if (/main stage history|crate digger/i.test(u)) return 'event-hook';
  if (/give out \d+ scores|matches final average/i.test(u)) return 'vote-habit';
  return 'stats-only';
}

const NEEDS_REVIEW = new Set([
  'first_in_pit',
  'perfect_match',
  'daily_listener_3',
  'daily_listener_7',
  'daily_listener_14',
  'daily_listener_30',
  'night_owl',
  'warm_up_act',
  'peak_time_dj',
  'b2b_dj',
  'ally_approved',
  'freddy_approved',
  'axolotl_drummer',
]);

module.exports = {
  resolveXlsxPath,
  loadBadgesFromXlsx,
  classifyUnlockType,
  NEEDS_REVIEW,
};
