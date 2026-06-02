const { User, Playlist, XpTransaction, Vote, PlaySession } = require('../models');
const { isDbConnected } = require('../config/db');
const { findUserDocumentById } = require('./auth');
const { getRankNameForLevel, getRankColorForLevel, getStaffRoleColor, getStaffRoleLabel, xpToNextLevel, xpForLevel } = require('../config/levels');

const XP_HISTORY_LIMIT = 50;
const VOTE_HISTORY_LIMIT = 25;

function formatDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function getUserFullData(userId) {
  if (!isDbConnected()) {
    return { error: 'Database not available' };
  }

  const user = await findUserDocumentById(userId);
  if (!user) {
    return { error: 'User not found' };
  }

  const uid = user._id;
  const level = user.level ?? 1;
  const xp = user.xp ?? 0;

  const [playlists, xpHistory, recentVotes] = await Promise.all([
    Playlist.find({ userId: uid }).sort({ isActive: -1, name: 1 }).lean(),
    XpTransaction.find({ userId: uid })
      .sort({ createdAt: -1 })
      .limit(XP_HISTORY_LIMIT)
      .lean(),
    Vote.find({ userId: uid })
      .sort({ createdAt: -1 })
      .limit(VOTE_HISTORY_LIMIT)
      .lean(),
  ]);

  const sessionIds = recentVotes.map((v) => v.playSessionId).filter(Boolean);
  const sessions = sessionIds.length
    ? await PlaySession.find({ _id: { $in: sessionIds } }).lean()
    : [];
  const sessionById = new Map(sessions.map((s) => [String(s._id), s]));

  const voteHistory = recentVotes.map((vote) => {
    const session = sessionById.get(String(vote.playSessionId));
    return {
      score: vote.score,
      votedAt: formatDate(vote.createdAt),
      youtubeId: session?.youtubeId ?? null,
      playSessionId: vote.playSessionId ? String(vote.playSessionId) : null,
    };
  });

  const stats = user.stats || {};

  return {
    ok: true,
    account: {
      id: String(uid),
      email: user.email,
      username: user.username,
      createdAt: formatDate(user.createdAt),
      updatedAt: formatDate(user.updatedAt),
    },
    progression: {
      level,
      rank: getRankNameForLevel(level),
      rankColor: getRankColorForLevel(level),
      xp,
      xpAtLevelStart: xpForLevel(level),
      xpToNextLevel: xpToNextLevel(xp),
    },
    staff: {
      staffRole: user.staffRole ?? null,
      staffRoleLabel: getStaffRoleLabel(user.staffRole),
      staffRoleColor: getStaffRoleColor(user.staffRole),
      badges: Array.isArray(user.badges) ? user.badges : [],
    },
    profile: {
      avatarUrl: user.avatarUrl ?? null,
      customSaying: user.customSaying ?? '',
      activePlaylistId: user.activePlaylistId ? String(user.activePlaylistId) : null,
    },
    stats: {
      totalPlays: stats.totalPlays ?? 0,
      totalListens: stats.totalListens ?? 0,
      totalVotesGiven: stats.totalVotesGiven ?? 0,
      totalVotesReceived: stats.totalVotesReceived ?? 0,
      avgScoreReceived: stats.avgScoreReceived ?? 0,
    },
    playlists: playlists.map((p) => ({
      id: String(p._id),
      name: p.name,
      isActive: Boolean(p.isActive),
      createdAt: formatDate(p.createdAt),
      updatedAt: formatDate(p.updatedAt),
    })),
    xpHistory: xpHistory.map((row) => ({
      amount: row.amount,
      reason: row.reason,
      createdAt: formatDate(row.createdAt),
    })),
    voteHistory,
  };
}

module.exports = { getUserFullData };
