const mongoose = require('mongoose');
const { User, Playlist, PlaylistItem } = require('../models');
const { isDbConnected } = require('../config/db');
const { getEarnedBadgeIds } = require('../config/badges');

/** @type {((payload: { userId: string, newBadgeIds: string[] }) => void)|null} */
let badgeNotifyHandler = null;

function setBadgeNotifyHandler(fn) {
  badgeNotifyHandler = typeof fn === 'function' ? fn : null;
}

/** Default user.stats used when clearing badge progress (keeps xp/level unchanged). */
function getDefaultBadgeProgressStats() {
  return {
    totalPlays: 0,
    totalListens: 0,
    totalVotesGiven: 0,
    totalVotesReceived: 0,
    avgScoreReceived: 0,
    chatMessages: 0,
    profilesViewed: 0,
    highVotesGiven: 0,
    lowVotesGiven: 0,
    nightListens: 0,
    listenerDayKey: null,
    listenerDayCount: 0,
    listenerStreakDays: 0,
    djDayKey: null,
    djDayCount: 0,
    djStreakDays: 0,
    voterStreakSessions: 0,
    perfectMatchCount: 0,
    firstVoterCount: 0,
    b2bDjCount: 0,
    hasHighScoreSet: false,
    hasPerfectRoom: false,
    hasCrowdPleaser: false,
    hasWarmUpAct: false,
    hasPeakTimeDj: false,
    hasCrateDigger: false,
    mentionedAxolotl: false,
    mentionedCoffee: false,
  };
}

function isValidObjectId(id) {
  if (!id) return false;
  const str = String(id);
  return mongoose.Types.ObjectId.isValid(str) && String(new mongoose.Types.ObjectId(str)) === str;
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 */
async function buildPlaylistBadgeContext(userId) {
  if (!isValidObjectId(userId)) {
    return { playlistCount: 0, maxPlaylistTracks: 0, hasPlaylistWithItem: false };
  }

  const playlists = await Playlist.find({ userId }).select('_id').lean();
  const playlistCount = playlists.length;
  let maxPlaylistTracks = 0;
  let hasPlaylistWithItem = false;
  let qualifiedPlaylists5 = 0;
  let qualifiedPlaylists10 = 0;

  for (const p of playlists) {
    const count = await PlaylistItem.countDocuments({ playlistId: p._id });
    if (count > 0) hasPlaylistWithItem = true;
    if (count > maxPlaylistTracks) maxPlaylistTracks = count;
    if (count >= 5) qualifiedPlaylists5 += 1;
    if (count >= 5) qualifiedPlaylists10 += 1;
  }

  return {
    playlistCount,
    maxPlaylistTracks,
    hasPlaylistWithItem,
    qualifiedPlaylists5,
    qualifiedPlaylists10,
  };
}

/**
 * Grant or revoke manual badges (admin).
 * @param {string} userId
 * @param {string} badgeId
 * @param {'grant'|'revoke'} action
 */
async function setManualBadge(userId, badgeId, action) {
  if (!isDbConnected() || !isValidObjectId(userId) || !badgeId) {
    return { error: 'Invalid request' };
  }

  if (action === 'grant') {
    await User.findByIdAndUpdate(userId, { $addToSet: { badges: badgeId } });
    return { ok: true, granted: badgeId };
  }
  if (action === 'revoke') {
    await User.findByIdAndUpdate(userId, { $pull: { badges: badgeId } });
    return { ok: true, revoked: badgeId };
  }
  return { error: 'Unknown action' };
}

/**
 * @param {import('mongoose').Document|object} user
 * @param {object} [extraCtx]
 * @returns {Promise<string[]>} newly granted badge ids
 */
async function evaluateAndGrantBadges(user, extraCtx = {}) {
  if (!isDbConnected() || !user) return [];

  const userId = user._id || user.id;
  if (!isValidObjectId(userId)) return [];

  const playlistCtx = await buildPlaylistBadgeContext(userId);
  const ctx = { ...playlistCtx, ...extraCtx };

  const shouldEarn = getEarnedBadgeIds(user, ctx);
  const current = Array.isArray(user.badges) ? user.badges : [];
  const toAdd = shouldEarn.filter((id) => !current.includes(id));

  if (!toAdd.length) return [];

  await User.findByIdAndUpdate(userId, { $addToSet: { badges: { $each: toAdd } } });

  if (Array.isArray(user.badges)) {
    for (const id of toAdd) {
      if (!user.badges.includes(id)) user.badges.push(id);
    }
  }

  if (badgeNotifyHandler) {
    try {
      badgeNotifyHandler({ userId: String(userId), newBadgeIds: toAdd });
    } catch (err) {
      console.warn('[badges] notify handler failed:', err.message);
    }
  }

  return toAdd;
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {object} [extraCtx]
 */
async function evaluateAndGrantBadgesById(userId, extraCtx = {}) {
  if (!isDbConnected() || !isValidObjectId(userId)) return [];

  const user = await User.findById(userId);
  if (!user) return [];
  return evaluateAndGrantBadges(user, extraCtx);
}

module.exports = {
  buildPlaylistBadgeContext,
  evaluateAndGrantBadges,
  evaluateAndGrantBadgesById,
  setManualBadge,
  setBadgeNotifyHandler,
  getDefaultBadgeProgressStats,
};
