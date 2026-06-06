const mongoose = require('mongoose');
const { User, PlaySession, Song } = require('../models');
const { isDbConnected } = require('../config/db');
const { findUserDocumentById } = require('./auth');
const { getRankNameForLevel, getRankColorForLevel, getStaffRoleLabel, getStaffRoleColor } = require('../config/levels');
const { resolveBadgeDetails, ALL_BADGE_IDS } = require('../config/badges');
const { evaluateAndGrantBadges } = require('./badges');
const { recordProfileViewBadgeStats } = require('./badge-tracking');
const { isValidObjectId } = require('./session');

async function getDjStageHighlights(userId) {
  if (!isDbConnected() || !isValidObjectId(userId)) {
    return { mostPlayedSong: null, highestVotedSong: null };
  }

  const oid = new mongoose.Types.ObjectId(userId);

  const mostPlayedAgg = await PlaySession.aggregate([
    { $match: { playedByUserId: oid, endedAt: { $ne: null } } },
    { $group: { _id: '$youtubeId', playCount: { $sum: 1 } } },
    { $sort: { playCount: -1 } },
    { $limit: 1 },
  ]);

  let mostPlayedSong = null;
  if (mostPlayedAgg.length && mostPlayedAgg[0]._id) {
    const song = await Song.findOne({ youtubeId: mostPlayedAgg[0]._id }).lean();
    mostPlayedSong = {
      title: song?.title || mostPlayedAgg[0]._id,
      playCount: mostPlayedAgg[0].playCount,
    };
  }

  const highestVotedSession = await PlaySession.findOne({
    playedByUserId: oid,
    'aggregates.voteCount': { $gt: 0 },
  })
    .sort({ 'aggregates.avgScore': -1, 'aggregates.highScore': -1 })
    .lean();

  let highestVotedSong = null;
  if (highestVotedSession?.youtubeId) {
    const song = await Song.findOne({ youtubeId: highestVotedSession.youtubeId }).lean();
    highestVotedSong = {
      title: song?.title || highestVotedSession.youtubeId,
      avgScore: highestVotedSession.aggregates?.avgScore ?? null,
      highScore: highestVotedSession.aggregates?.highScore ?? null,
    };
  }

  return { mostPlayedSong, highestVotedSong };
}

async function getPublicUserProfile(userId, viewerUserId = null) {
  if (!isDbConnected()) {
    return { error: 'Database not available' };
  }

  let user = await findUserDocumentById(userId);
  if (!user) {
    return { error: 'User not found' };
  }

  if (viewerUserId && String(viewerUserId) !== String(userId)) {
    await recordProfileViewBadgeStats(viewerUserId);
  }

  await evaluateAndGrantBadges(user);

  user = await findUserDocumentById(userId);
  if (!user) {
    return { error: 'User not found' };
  }

  const level = user.level ?? 1;
  const stats = user.stats || {};
  const badgeIds = Array.isArray(user.badges) ? user.badges : [];
  const stageHighlights = await getDjStageHighlights(userId);

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
      badgesEarned: badgeIds.length,
      badgesTotal: ALL_BADGE_IDS.length,
      stageHighlights,
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

module.exports = { getPublicUserProfile, getDjStageHighlights };
