const bcrypt = require('bcryptjs');
const { isDbConnected } = require('../config/db');
const { FOUNDER_ADMINS, matchesFounderAdmin } = require('../config/founderAdmins');
const {
  User,
  Song,
  Vote,
  PlaySession,
  XpTransaction,
  Playlist,
  PlaylistItem,
  StaffAuditLog,
} = require('../models');
const { getDefaultBadgeProgressStats } = require('./badges');
const { MIN_PASSWORD_LEN } = require('./auth');
const { logStaffAction } = require('./staffAudit');
const testDjAccount = require('./testDjAccount');

const CONFIRM = {
  songs: 'RESET_SONGS',
  votes: 'RESET_VOTES',
  playSessions: 'RESET_PLAY_SESSIONS',
  xpTransactions: 'RESET_XP_TRANSACTIONS',
  userProgress: 'RESET_USER_PROGRESS',
  nuclear: 'DELETE_ALL_USERS',
};

function requireConfirm(body, key) {
  const expected = CONFIRM[key];
  const got = String(body?.confirm || '').trim();
  if (got !== expected) {
    return {
      error: 'Confirmation required',
      hint: `Send { "confirm": "${expected}" } in the request body`,
    };
  }
  return null;
}

async function getDataStats() {
  if (!isDbConnected()) return { error: 'Database not available' };

  const [songs, votes, playSessions, xpTransactions, users, playlists, playlistItems] =
    await Promise.all([
      Song.countDocuments({}),
      Vote.countDocuments({}),
      PlaySession.countDocuments({}),
      XpTransaction.countDocuments({}),
      User.countDocuments({ isSystemAccount: { $ne: true } }),
      Playlist.countDocuments({}),
      PlaylistItem.countDocuments({}),
    ]);

  return {
    ok: true,
    counts: {
      songs,
      votes,
      playSessions,
      xpTransactions,
      users,
      playlists,
      playlistItems,
    },
  };
}

async function logFounderAction(actor, action, details = {}) {
  await logStaffAction({
    actorUserId: actor.id,
    actorUsername: actor.username,
    action,
    details,
  });
}

async function resetSongs(actor) {
  if (!isDbConnected()) return { error: 'Database not available' };
  const deleted = (await Song.deleteMany({})).deletedCount;
  await logFounderAction(actor, 'founderResetSongs', { deleted });
  return { ok: true, deleted };
}

async function resetVotes(actor) {
  if (!isDbConnected()) return { error: 'Database not available' };
  const deleted = (await Vote.deleteMany({})).deletedCount;
  await logFounderAction(actor, 'founderResetVotes', { deleted });
  return { ok: true, deleted };
}

async function resetPlaySessions(actor) {
  if (!isDbConnected()) return { error: 'Database not available' };
  const deleted = (await PlaySession.deleteMany({})).deletedCount;
  await logFounderAction(actor, 'founderResetPlaySessions', { deleted });
  return { ok: true, deleted };
}

async function resetXpTransactions(actor) {
  if (!isDbConnected()) return { error: 'Database not available' };
  const deleted = (await XpTransaction.deleteMany({})).deletedCount;
  await logFounderAction(actor, 'founderResetXpTransactions', { deleted });
  return { ok: true, deleted };
}

/**
 * Clear collected progress for every real account. Keeps logins, profiles, and playlists.
 */
async function resetUserProgress(actor) {
  if (!isDbConnected()) return { error: 'Database not available' };

  const defaultStats = getDefaultBadgeProgressStats();
  const voteDeleted = (await Vote.deleteMany({})).deletedCount;
  const xpDeleted = (await XpTransaction.deleteMany({})).deletedCount;

  const userResult = await User.updateMany(
    { isSystemAccount: { $ne: true } },
    {
      $set: {
        xp: 0,
        level: 1,
        stats: defaultStats,
        badges: ['account_created'],
      },
    }
  );

  await logFounderAction(actor, 'founderResetUserProgress', {
    usersModified: userResult.modifiedCount ?? 0,
    votesDeleted: voteDeleted,
    xpTransactionsDeleted: xpDeleted,
  });

  return {
    ok: true,
    usersModified: userResult.modifiedCount ?? 0,
    votesDeleted: voteDeleted,
    xpTransactionsDeleted: xpDeleted,
  };
}

async function nuclearWipeAllUsers(actor, { password } = {}) {
  if (!isDbConnected()) return { error: 'Database not available' };

  const nextPassword = String(password || '').trim();
  if (nextPassword.length < MIN_PASSWORD_LEN) {
    return { error: `Password must be at least ${MIN_PASSWORD_LEN} characters` };
  }

  const founder = FOUNDER_ADMINS[0];
  const founderEmail = String(founder.email).trim().toLowerCase();
  const founderUsername = String(founder.username).trim();

  await logFounderAction(actor, 'founderNuclearWipeRequested', {
    founderEmail,
  });

  const deleted = {
    votes: (await Vote.deleteMany({})).deletedCount,
    playlistItems: (await PlaylistItem.deleteMany({})).deletedCount,
    playlists: (await Playlist.deleteMany({})).deletedCount,
    xpTransactions: (await XpTransaction.deleteMany({})).deletedCount,
    staffAuditLogs: (await StaffAuditLog.deleteMany({})).deletedCount,
    playSessions: (await PlaySession.deleteMany({})).deletedCount,
    songs: (await Song.deleteMany({})).deletedCount,
    users: (await User.deleteMany({})).deletedCount,
  };

  const passwordHash = await bcrypt.hash(nextPassword, 10);
  const user = await User.create({
    email: founderEmail,
    username: founderUsername,
    passwordHash,
    level: 1,
    xp: 0,
    staffRole: 'admin',
    badges: ['account_created'],
  });

  await testDjAccount.ensureTestDjAccountInDb();

  return {
    ok: true,
    deleted,
    founder: {
      id: String(user._id),
      email: user.email,
      username: user.username,
    },
    requiresReLogin: true,
  };
}

module.exports = {
  CONFIRM,
  requireConfirm,
  getDataStats,
  resetSongs,
  resetVotes,
  resetPlaySessions,
  resetXpTransactions,
  resetUserProgress,
  nuclearWipeAllUsers,
};
