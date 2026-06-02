const express = require('express');
const {
  MAX_LEVEL,
  MIN_VOTE_LEVEL,
  THRESHOLDS,
  RANK_NAMES,
  RANK_COLORS,
  STAFF_ROLE_COLORS,
  STAFF_ROLE_LABELS,
} = require('../config/levels');
const { LISTENER_XP, DJ_XP, VOTE_XP } = require('../services/session');

const router = express.Router();

function buildRankTiers() {
  const tiers = [];
  let start = 1;
  let currentName = RANK_NAMES[1];

  for (let level = 2; level <= MAX_LEVEL + 1; level += 1) {
    const name = level <= MAX_LEVEL ? RANK_NAMES[level] : null;
    if (name !== currentName) {
      tiers.push({
        name: currentName,
        color: RANK_COLORS[currentName] || RANK_COLORS.Novice,
        levelFrom: start,
        levelTo: level - 1,
        xpFrom: THRESHOLDS[start],
        xpTo: level - 1 < MAX_LEVEL ? THRESHOLDS[level] - 1 : THRESHOLDS[MAX_LEVEL],
      });
      start = level;
      currentName = name;
    }
  }

  return tiers;
}

function buildLevels() {
  const levels = [];
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    levels.push({
      level,
      rank: RANK_NAMES[level] || 'Novice',
      rankColor: RANK_COLORS[RANK_NAMES[level]] || RANK_COLORS.Novice,
      xpRequired: THRESHOLDS[level],
      xpToNext: level < MAX_LEVEL ? THRESHOLDS[level + 1] - THRESHOLDS[level] : 0,
    });
  }
  return levels;
}

router.get('/progression', (_req, res) => {
  res.json({
    maxLevel: MAX_LEVEL,
    minVoteLevel: MIN_VOTE_LEVEL,
    xpRewards: {
      listen: LISTENER_XP,
      dj: DJ_XP,
      vote: VOTE_XP,
    },
    rankTiers: buildRankTiers(),
    levels: buildLevels(),
    staffRoles: [
      {
        id: 'mod',
        label: STAFF_ROLE_LABELS.mod,
        color: STAFF_ROLE_COLORS.mod,
        summary: 'Keeps chat and the stage civil. Uses Mod Tools on the live room.',
      },
      {
        id: 'admin',
        label: STAFF_ROLE_LABELS.admin,
        color: STAFF_ROLE_COLORS.admin,
        summary: 'Full platform control. Uses Admin Panel plus everything mods can do.',
      },
    ],
    badges: {
      intro:
        'Badges are achievements you earn automatically by listening, voting, DJing, and leveling up. View yours in My Data, or click any registered username in chat to see their profile and badges.',
      placeholder: null,
    },
  });
});

module.exports = router;
