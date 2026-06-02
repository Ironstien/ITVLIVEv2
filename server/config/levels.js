/**
 * XP thresholds for levels 1–60 (from product progression sheet).
 * THRESHOLDS[N] = minimum total XP to be at level N.
 * Level 1 starts at 0 XP; level 60 (Legend) is the cap.
 */

const MAX_LEVEL = 60;
const MIN_VOTE_LEVEL = 2;

/** Total XP required to reach each level (index = level). */
const THRESHOLDS = [
  0, // unused index 0
  0, // 1  Novice
  15, // 2  Novice
  57, // 3  Novice
  134, // 4  Novice
  254, // 5  Novice
  421, // 6  Novice
  641, // 7  Novice
  918, // 8  Novice
  1257, // 9  Novice
  1662, // 10 Regular
  2136, // 11 Regular
  2683, // 12 Regular
  3306, // 13 Regular
  4009, // 14 Regular
  4794, // 15 Regular
  5665, // 16 Regular
  6625, // 17 Regular
  7676, // 18 Regular
  8821, // 19 Regular
  10063, // 20 Member
  11404, // 21 Member
  12847, // 22 Member
  14394, // 23 Member
  16048, // 24 Member
  17811, // 25 Member
  19686, // 26 Member
  21674, // 27 Member
  23778, // 28 Member
  26000, // 29 Member
  28342, // 30 Veteran
  30806, // 31 Veteran
  33395, // 32 Veteran
  36110, // 33 Veteran
  38953, // 34 Veteran
  41926, // 35 Veteran
  45031, // 36 Veteran
  48271, // 37 Veteran
  51647, // 38 Veteran
  55160, // 39 Veteran
  58813, // 40 Elite
  62607, // 41 Elite
  66544, // 42 Elite
  70626, // 43 Elite
  74855, // 44 Elite
  79232, // 45 Elite
  83759, // 46 Elite
  88438, // 47 Elite
  93270, // 48 Elite
  98257, // 49 Elite
  103401, // 50 Champion
  108704, // 51 Champion
  114167, // 52 Champion
  119791, // 53 Champion
  125578, // 54 Champion
  131530, // 55 Champion
  137648, // 56 Champion
  143933, // 57 Champion
  150387, // 58 Champion
  157012, // 59 Champion
  163809, // 60 Legend
];

const RANK_NAMES = [
  '', // unused
  'Novice',
  'Novice',
  'Novice',
  'Novice',
  'Novice',
  'Novice',
  'Novice',
  'Novice',
  'Novice',
  'Regular',
  'Regular',
  'Regular',
  'Regular',
  'Regular',
  'Regular',
  'Regular',
  'Regular',
  'Regular',
  'Regular',
  'Member',
  'Member',
  'Member',
  'Member',
  'Member',
  'Member',
  'Member',
  'Member',
  'Member',
  'Member',
  'Veteran',
  'Veteran',
  'Veteran',
  'Veteran',
  'Veteran',
  'Veteran',
  'Veteran',
  'Veteran',
  'Veteran',
  'Veteran',
  'Elite',
  'Elite',
  'Elite',
  'Elite',
  'Elite',
  'Elite',
  'Elite',
  'Elite',
  'Elite',
  'Elite',
  'Champion',
  'Champion',
  'Champion',
  'Champion',
  'Champion',
  'Champion',
  'Champion',
  'Champion',
  'Champion',
  'Champion',
  'Legend',
];

/** Rank name colours (progression tiers). */
const RANK_COLORS = {
  Novice: '#9E9E9E',
  Regular: '#4CAF50',
  Member: '#2196F3',
  Veteran: '#9C27B0',
  Elite: '#FF9800',
  Champion: '#E53935',
  Legend: '#FFD700',
};

/** Staff role colours (Mod uses teal; Admin uses magenta on dark UI). */
const STAFF_ROLE_COLORS = {
  mod: '#009688',
  admin: '#E91E63',
};

const STAFF_ROLE_LABELS = {
  mod: 'Mod',
  admin: 'Admin',
};

function getRankColorForLevel(level) {
  const name = getRankNameForLevel(level);
  return RANK_COLORS[name] || RANK_COLORS.Novice;
}

function getRankColorForName(rankName) {
  if (!rankName) return RANK_COLORS.Novice;
  return RANK_COLORS[rankName] || RANK_COLORS.Novice;
}

function getStaffRoleColor(staffRole) {
  if (!staffRole) return null;
  return STAFF_ROLE_COLORS[staffRole] || null;
}

function getStaffRoleLabel(staffRole) {
  if (!staffRole) return null;
  return STAFF_ROLE_LABELS[staffRole] || staffRole;
}

function xpForLevel(level) {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return THRESHOLDS[n];
}

function getLevelForXp(xp) {
  const total = Math.max(0, Math.floor(xp));
  let level = 1;
  for (let l = MAX_LEVEL; l >= 1; l--) {
    if (total >= THRESHOLDS[l]) {
      level = l;
      break;
    }
  }
  return level;
}

function getRankNameForLevel(level) {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return RANK_NAMES[n] || 'Novice';
}

function totalXp(xp) {
  return Math.max(0, Math.floor(xp));
}

function xpToNextLevel(xp) {
  const level = getLevelForXp(xp);
  if (level >= MAX_LEVEL) return 0;
  return THRESHOLDS[level + 1] - totalXp(xp);
}

module.exports = {
  MAX_LEVEL,
  MIN_VOTE_LEVEL,
  THRESHOLDS,
  RANK_NAMES,
  RANK_COLORS,
  STAFF_ROLE_COLORS,
  STAFF_ROLE_LABELS,
  xpForLevel,
  getLevelForXp,
  getRankNameForLevel,
  getRankColorForLevel,
  getRankColorForName,
  getStaffRoleColor,
  getStaffRoleLabel,
  xpToNextLevel,
  totalXp,
};
