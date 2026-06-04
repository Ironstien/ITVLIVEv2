/**
 * Achievement badges — full catalog from Badges.xlsx.
 * IDs stored on user.badges — never rename once live.
 */
const fs = require('fs');
const path = require('path');
const { evaluateAutoBadges } = require('./badge-evaluators');

const CATALOG_PATH = path.join(__dirname, 'badge-catalog.json');

/** @type {{ id: string, name: string, tier: number, image: string, description: string, unlockType?: string, autoGrant?: boolean }[]} */
let BADGE_DEFINITIONS = [];
try {
  const raw = fs.readFileSync(CATALOG_PATH, 'utf8');
  const catalog = JSON.parse(raw);
  BADGE_DEFINITIONS = catalog.map((b) => ({
    id: b.id,
    name: b.name,
    tier: b.tier,
    image: b.image || `/img/badges/${b.id}.png`,
    description: b.description || '',
    unlockType: b.unlockType,
    autoGrant: b.autoGrant !== false,
  }));
} catch (err) {
  console.warn('[badges] badge-catalog.json missing — run: node scripts/import-badges-from-xlsx.js');
  BADGE_DEFINITIONS = [];
}

const MANUAL_BADGE_IDS = BADGE_DEFINITIONS.filter((b) => b.unlockType === 'manual' || b.autoGrant === false).map(
  (b) => b.id
);

const AUTO_BADGE_IDS = BADGE_DEFINITIONS.filter((b) => !MANUAL_BADGE_IDS.includes(b.id)).map((b) => b.id);

/** @deprecated use AUTO_BADGE_IDS */
const LAUNCH_BADGE_IDS = AUTO_BADGE_IDS;

const ALL_BADGE_IDS = BADGE_DEFINITIONS.map((b) => b.id);

const BADGE_BY_ID = new Map(BADGE_DEFINITIONS.map((b) => [b.id, b]));

function getBadgeDefinition(id) {
  return BADGE_BY_ID.get(id) || null;
}

function getBadgeDisplayName(id) {
  const def = getBadgeDefinition(id);
  return def?.name || String(id).replace(/_/g, ' ');
}

function getPublicBadgeCatalog() {
  return BADGE_DEFINITIONS.map(({ id, name, tier, image, description }) => ({
    id,
    name,
    tier,
    image,
    description,
  }));
}

function resolveBadgeDetails(badgeIds) {
  const ids = Array.isArray(badgeIds) ? badgeIds : [];
  return ids
    .map((id) => {
      const def = getBadgeDefinition(id);
      if (!def) {
        return { id, name: id, tier: 0, image: `/img/badges/${id}.png`, description: '' };
      }
      return {
        id: def.id,
        name: def.name,
        tier: def.tier,
        image: def.image,
        description: def.description,
      };
    })
    .filter(Boolean);
}

/**
 * @param {object} user Mongoose user doc or plain object
 * @param {object} [ctx]
 */
function getEarnedBadgeIds(user, ctx = {}) {
  if (!user) return [];

  const stats = user.stats || {};
  const autoEarned = evaluateAutoBadges(user, stats, ctx);

  const manualEarned = Array.isArray(user.badges)
    ? user.badges.filter((id) => MANUAL_BADGE_IDS.includes(id))
    : [];

  const merged = new Set([...autoEarned, ...manualEarned]);
  return [...merged].filter((id) => ALL_BADGE_IDS.includes(id) || MANUAL_BADGE_IDS.includes(id));
}

function isManualBadgeId(id) {
  return MANUAL_BADGE_IDS.includes(id);
}

module.exports = {
  LAUNCH_BADGE_IDS,
  AUTO_BADGE_IDS,
  ALL_BADGE_IDS,
  MANUAL_BADGE_IDS,
  BADGE_DEFINITIONS,
  getBadgeDefinition,
  getBadgeDisplayName,
  getPublicBadgeCatalog,
  resolveBadgeDetails,
  getEarnedBadgeIds,
  isManualBadgeId,
};
