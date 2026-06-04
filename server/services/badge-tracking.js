const { User } = require('../models');
const { isDbConnected } = require('../config/db');
const {
  bumpListenerDay,
  bumpDjDay,
  recordNightListen,
  recordVoteScoreHabits,
  recordVoterStreakOnVote,
  resetVoterStreak,
  recordPerfectMatch,
  recordFirstVoter,
  recordB2bFollow,
  resetB2bFollow,
} = require('../config/badge-progress');
const { evaluateAndGrantBadgesById } = require('./badges');

function isValidObjectId(id) {
  if (!id) return false;
  const mongoose = require('mongoose');
  const str = String(id);
  return mongoose.Types.ObjectId.isValid(str) && String(new mongoose.Types.ObjectId(str)) === str;
}

async function recordListenBadgeStats(userId, endedAt = Date.now()) {
  if (!isDbConnected() || !isValidObjectId(userId)) return;

  const user = await User.findById(userId);
  if (!user) return;

  if (!user.stats) user.stats = {};
  bumpListenerDay(user.stats, endedAt);
  recordNightListen(user.stats, endedAt);
  user.markModified('stats');
  await user.save();
}

async function recordVoteBadgeStats(userId, score, aggregates, { isFirstVoter = false } = {}) {
  if (!isDbConnected() || !isValidObjectId(userId)) return;

  const user = await User.findById(userId);
  if (!user) return;

  if (!user.stats) user.stats = {};
  recordVoteScoreHabits(user.stats, score);
  recordVoterStreakOnVote(user.stats);
  if (aggregates?.avgScore != null) {
    recordPerfectMatch(user.stats, score, aggregates.avgScore);
  }
  if (isFirstVoter) recordFirstVoter(user.stats);
  user.markModified('stats');
  await user.save();
}

async function resetVoterStreakForUsers(userIds) {
  if (!isDbConnected()) return;

  for (const userId of userIds) {
    if (!isValidObjectId(userId)) continue;
    const user = await User.findById(userId);
    if (!user) continue;
    if (!user.stats) user.stats = {};
    resetVoterStreak(user.stats);
    user.markModified('stats');
    await user.save();
  }
}

async function recordDjPlayBadgeStats(
  djUserId,
  { aggregates, listenerCountAtStart, previousDjUserId, endedAt = Date.now() }
) {
  if (!isDbConnected() || !isValidObjectId(djUserId)) return;

  const user = await User.findById(djUserId);
  if (!user) return;

  if (!user.stats) user.stats = {};
  bumpDjDay(user.stats, endedAt);

  if (previousDjUserId && String(previousDjUserId) === String(djUserId)) {
    recordB2bFollow(user.stats);
  } else {
    resetB2bFollow(user.stats);
  }

  if (aggregates) {
    if (aggregates.avgScore >= 95 && aggregates.voteCount >= 3) {
      user.stats.hasHighScoreSet = true;
    }
    if (aggregates.voteCount >= 5 && aggregates.lowScore >= 100) {
      user.stats.hasPerfectRoom = true;
    }
    if ((aggregates.highScoreCount90 ?? 0) >= 5) {
      user.stats.hasCrowdPleaser = true;
    }
  }

  if (listenerCountAtStart != null) {
    if (listenerCountAtStart < 3) user.stats.hasWarmUpAct = true;
    if (listenerCountAtStart > 20) user.stats.hasPeakTimeDj = true;
  }

  user.markModified('stats');
  await user.save();

  await evaluateAndGrantBadgesById(djUserId, {
    sessionAggregates: aggregates,
    listenerCountAtStart,
  });
}

async function recordChatBadgeStats(userId, text) {
  if (!isDbConnected() || !isValidObjectId(userId)) return [];

  const user = await User.findById(userId);
  if (!user) return [];

  if (!user.stats) user.stats = {};
  user.stats.chatMessages = (user.stats.chatMessages ?? 0) + 1;

  const lower = String(text || '').toLowerCase();
  if (lower.includes('axolotl')) user.stats.mentionedAxolotl = true;
  if (lower.includes('coffee')) user.stats.mentionedCoffee = true;

  user.markModified('stats');
  await user.save();

  return evaluateAndGrantBadgesById(userId);
}

async function recordProfileViewBadgeStats(viewerUserId) {
  if (!isDbConnected() || !isValidObjectId(viewerUserId)) return [];

  await User.findByIdAndUpdate(viewerUserId, { $inc: { 'stats.profilesViewed': 1 } });
  return evaluateAndGrantBadgesById(viewerUserId);
}

async function recordCrateDigger(userId) {
  if (!isDbConnected() || !isValidObjectId(userId)) return [];

  await User.findByIdAndUpdate(userId, { $set: { 'stats.hasCrateDigger': true } });
  return evaluateAndGrantBadgesById(userId);
}

module.exports = {
  recordListenBadgeStats,
  recordVoteBadgeStats,
  resetVoterStreakForUsers,
  recordDjPlayBadgeStats,
  recordChatBadgeStats,
  recordProfileViewBadgeStats,
  recordCrateDigger,
};
