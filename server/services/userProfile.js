const { User } = require('../models');
const { isDbConnected } = require('../config/db');
const { findUserDocumentById } = require('./auth');
const { getRankNameForLevel, getRankColorForLevel, getStaffRoleLabel, getStaffRoleColor } = require('../config/levels');
const { resolveBadgeDetails } = require('../config/badges');
const { evaluateAndGrantBadges } = require('./badges');

async function getPublicUserProfile(userId) {
  if (!isDbConnected()) {
    return { error: 'Database not available' };
  }

  let user = await findUserDocumentById(userId);
  if (!user) {
    return { error: 'User not found' };
  }

  await evaluateAndGrantBadges(user);

  user = await findUserDocumentById(userId);
  if (!user) {
    return { error: 'User not found' };
  }

  const level = user.level ?? 1;
  const stats = user.stats || {};
  const badgeIds = Array.isArray(user.badges) ? user.badges : [];

  return {
    ok: true,
    profile: {
      id: String(user._id),
      username: user.username,
      avatarUrl: user.avatarUrl ?? null,
      customSaying: user.customSaying ?? '',
      level,
      rank: getRankNameForLevel(level),
      rankColor: getRankColorForLevel(level),
      staffRole: user.staffRole ?? null,
      staffRoleLabel: getStaffRoleLabel(user.staffRole),
      staffRoleColor: getStaffRoleColor(user.staffRole),
      badges: badgeIds,
      badgeDetails: resolveBadgeDetails(badgeIds),
      stats: {
        totalPlays: stats.totalPlays ?? 0,
        totalListens: stats.totalListens ?? 0,
        totalVotesGiven: stats.totalVotesGiven ?? 0,
        totalVotesReceived: stats.totalVotesReceived ?? 0,
        avgScoreReceived: stats.avgScoreReceived ?? 0,
      },
      memberSince: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    },
  };
}

module.exports = { getPublicUserProfile };
