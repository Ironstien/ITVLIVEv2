const mongoose = require('mongoose');
const { PlaySession, Vote, XpTransaction, User, Song } = require('../models');
const { isDbConnected } = require('../config/db');
const { getLevelForXp } = require('../config/levels');
const { evaluateAndGrantBadges } = require('./badges');
const {
  recordListenBadgeStats,
  recordVoteBadgeStats,
  resetVoterStreakForUsers,
  recordDjPlayBadgeStats,
} = require('./badge-tracking');

const LISTENER_XP = 1;
const DJ_XP = 3;
const VOTE_XP = 2;

function isValidObjectId(id) {
  if (!id) return false;
  const str = String(id);
  return mongoose.Types.ObjectId.isValid(str) && String(new mongoose.Types.ObjectId(str)) === str;
}

function clampScore(score) {
  const n = Math.floor(Number(score));
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(100, n));
}

function computeVoteAggregates(voteEntries) {
  let voteCount = 0;
  let totalScore = 0;
  let highScore = 0;
  let lowScore = 100;
  let highScoreCount90 = 0;

  for (const [, rawScore] of voteEntries) {
    const score = clampScore(rawScore);
    if (score == null) continue;
    voteCount += 1;
    totalScore += score;
    if (score > highScore) highScore = score;
    if (score < lowScore) lowScore = score;
    if (score >= 90) highScoreCount90 += 1;
  }

  const avgScore = voteCount ? Math.round((totalScore / voteCount) * 10) / 10 : 0;

  return {
    voteCount,
    totalScore,
    avgScore,
    highScore: voteCount ? highScore : 0,
    lowScore: voteCount ? lowScore : 0,
    highScoreCount90,
  };
}

async function createPlaySessionRecord({ sessionKey, youtubeId, playedByUserId, startedAt }) {
  if (!isDbConnected() || !sessionKey) return null;

  try {
    const doc = await PlaySession.create({
      sessionKey,
      youtubeId,
      playedByUserId: isValidObjectId(playedByUserId) ? playedByUserId : null,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
    });
    return doc;
  } catch (err) {
    console.warn('[session] create PlaySession failed:', err.message);
    return null;
  }
}

async function grantXpToUser(userId, amount, reason) {
  if (!isDbConnected() || !isValidObjectId(userId) || amount <= 0) return null;

  const user = await User.findById(userId);
  if (!user) return null;

  const beforeLevel = user.level ?? 1;
  user.xp = (user.xp ?? 0) + amount;
  user.level = getLevelForXp(user.xp);
  await user.save();

  await XpTransaction.create({ userId, amount, reason });

  const newBadges = await evaluateAndGrantBadges(user);

  return {
    userId: String(user._id),
    xp: user.xp,
    level: user.level,
    delta: amount,
    reason,
    leveledUp: user.level > beforeLevel,
    newBadges,
  };
}

async function persistVotes(playSessionId, voteEntries, aggregates) {
  let isFirstVoter = true;

  for (const [userId, rawScore] of voteEntries) {
    if (!isValidObjectId(userId) || !playSessionId) continue;
    const score = clampScore(rawScore);
    if (score == null) continue;

    try {
      await Vote.create({ playSessionId, userId, score });
      await User.findByIdAndUpdate(userId, { $inc: { 'stats.totalVotesGiven': 1 } });
      await recordVoteBadgeStats(userId, score, aggregates, { isFirstVoter });
      isFirstVoter = false;
    } catch (err) {
      if (err.code !== 11000) {
        console.warn('[session] vote persist failed:', err.message);
      }
    }
  }
}

async function updateSongStats(youtubeId, title, aggregates) {
  if (!isDbConnected() || !youtubeId) return;

  let song = await Song.findOne({ youtubeId });
  if (!song) {
    song = await Song.create({
      youtubeId,
      title: title || youtubeId,
      stats: { playCount: 0, voteCount: 0, totalScore: 0, avgScore: 0, highScore: 0, lowScore: 0 },
    });
  }

  song.stats.playCount = (song.stats.playCount ?? 0) + 1;
  if (aggregates.voteCount > 0) {
    song.stats.voteCount = (song.stats.voteCount ?? 0) + aggregates.voteCount;
    song.stats.totalScore = (song.stats.totalScore ?? 0) + aggregates.totalScore;
    song.stats.avgScore = song.stats.voteCount
      ? Math.round((song.stats.totalScore / song.stats.voteCount) * 10) / 10
      : 0;
    song.stats.highScore = Math.max(song.stats.highScore ?? 0, aggregates.highScore);
    if (!song.stats.lowScore || song.stats.voteCount === aggregates.voteCount) {
      song.stats.lowScore = aggregates.lowScore;
    } else {
      song.stats.lowScore = Math.min(song.stats.lowScore, aggregates.lowScore);
    }
  }
  if (title && song.title !== title) song.title = title;
  await song.save();
}

async function updateDjStats(djUserId, aggregates) {
  if (!isValidObjectId(djUserId)) return;

  const user = await User.findById(djUserId);
  if (!user) return;

  const stats = user.stats || {};
  const prevReceived = stats.totalVotesReceived ?? 0;
  const prevAvg = stats.avgScoreReceived ?? 0;
  const newReceived = prevReceived + aggregates.voteCount;
  let newAvg = prevAvg;

  if (aggregates.voteCount > 0 && newReceived > 0) {
    newAvg =
      Math.round(
        ((prevAvg * prevReceived + aggregates.avgScore * aggregates.voteCount) / newReceived) * 10
      ) / 10;
  }

  user.stats.totalPlays = (stats.totalPlays ?? 0) + 1;
  user.stats.totalVotesReceived = newReceived;
  user.stats.avgScoreReceived = newAvg;
  await user.save();
}

async function grantVoteXp(voteEntries) {
  const progressUpdates = [];
  const seen = new Set();

  for (const [userId] of voteEntries) {
    if (!isValidObjectId(userId) || seen.has(userId)) continue;
    seen.add(userId);
    const progress = await grantXpToUser(userId, VOTE_XP, 'vote');
    if (progress) progressUpdates.push(progress);
  }

  return progressUpdates;
}

async function grantListenerXp(listenerUserIds, djUserId, endedAt = Date.now()) {
  const progressUpdates = [];
  const seen = new Set();

  for (const userId of listenerUserIds) {
    if (!isValidObjectId(userId)) continue;
    if (userId === djUserId) continue;
    if (seen.has(userId)) continue;
    seen.add(userId);

    await User.findByIdAndUpdate(userId, { $inc: { 'stats.totalListens': 1 } });
    await recordListenBadgeStats(userId, endedAt);
    const progress = await grantXpToUser(userId, LISTENER_XP, 'listen');
    if (progress) {
      progressUpdates.push(progress);
    }
  }

  return progressUpdates;
}

/**
 * Persist votes, update aggregates, grant XP.
 * @param {object} params
 * @returns {Promise<{ progressUpdates: object[] }>}
 */
async function finalizePlaySession({
  sessionKey,
  playSessionId,
  youtubeId,
  title,
  djName,
  djUserId,
  pendingVotes,
  listenerUserIds,
  eligibleVoterIds,
  endedAt,
  listenerCountAtStart,
  previousDjUserId,
}) {
  const voteEntries = [...pendingVotes.entries()];
  const aggregates = computeVoteAggregates(voteEntries);
  const endMs = endedAt || Date.now();

  const progressUpdates = [];

  if (!isDbConnected()) {
    return { progressUpdates };
  }

  if (playSessionId) {
    await PlaySession.findByIdAndUpdate(playSessionId, {
      endedAt: new Date(endMs),
      aggregates: {
        voteCount: aggregates.voteCount,
        totalScore: aggregates.totalScore,
        avgScore: aggregates.avgScore,
        highScore: aggregates.highScore,
        lowScore: aggregates.lowScore,
      },
    });

    await persistVotes(playSessionId, voteEntries, aggregates);
  }

  const voterIds = new Set(voteEntries.map(([uid]) => String(uid)));
  const toResetStreak = (eligibleVoterIds || []).filter((uid) => !voterIds.has(String(uid)));
  await resetVoterStreakForUsers(toResetStreak);

  const voteProgress = await grantVoteXp(voteEntries);
  progressUpdates.push(...voteProgress);

  await updateSongStats(youtubeId, title, aggregates);

  if (isValidObjectId(djUserId)) {
    await updateDjStats(djUserId, aggregates);
    const djPlayBadges = await recordDjPlayBadgeStats(djUserId, {
      aggregates,
      listenerCountAtStart,
      previousDjUserId,
      endedAt: endMs,
    });
    const djProgress = await grantXpToUser(djUserId, DJ_XP, 'dj_play');
    if (djProgress) {
      if (djPlayBadges?.length) {
        const merged = new Set([...(djProgress.newBadges || []), ...djPlayBadges]);
        djProgress.newBadges = [...merged];
      }
      progressUpdates.push(djProgress);
    }
  }

  const listenerProgress = await grantListenerXp(listenerUserIds, djUserId, endMs);
  progressUpdates.push(...listenerProgress);

  return { progressUpdates };
}

module.exports = {
  LISTENER_XP,
  DJ_XP,
  VOTE_XP,
  createPlaySessionRecord,
  finalizePlaySession,
  grantXpToUser,
  isValidObjectId,
};
