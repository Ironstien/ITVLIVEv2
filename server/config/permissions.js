const { MIN_VOTE_LEVEL } = require('./levels');

/** Actions that require an authenticated account (not a guest stub). */
const AUTH_REQUIRED = new Set([
  'joinQueue',
  'leaveQueue',
  'editPlaylist',
  'managePlaylists',
  'rip',
  'skipOwnPlaying',
  'skipOwnWaiting',
]);

/** Mod or admin only. */
const MOD_ACTIONS = new Set([
  'clearChat',
  'muteUser',
  'unmuteUser',
  'skipAnySong',
  'removeFromQueue',
  'deleteChatMessage',
  'lockChat',
  'unlockChat',
]);

/** Admin only. */
const ADMIN_ACTIONS = new Set([
  'assignStaffRole',
  'setUserXp',
  'managePlatform',
  'resetUserStats',
  'forceDisconnect',
  'blockVideo',
  'unblockVideo',
  'accountBan',
  'unbanAccount',
]);

const STAFF_ROLES = ['mod', 'admin'];

function isGuest(user) {
  if (user == null) return true;
  if (user.userId == null && user._id == null && user.id == null) return true;
  return false;
}

function staffRole(user) {
  if (isGuest(user)) return null;
  return user.staffRole || null;
}

function isModOrAbove(user) {
  const role = staffRole(user);
  return role === 'mod' || role === 'admin';
}

function isAdmin(user) {
  return staffRole(user) === 'admin';
}

/**
 * Permission check for room/API actions. No host-only actions in v2.
 * @param {object|null|undefined} user — Mongoose user doc, auth payload, or guest stub
 * @param {string} action
 * @returns {boolean}
 */
function can(user, action) {
  if (action === 'chat' || action === 'listen') {
    return true;
  }

  if (isGuest(user)) {
    return false;
  }

  if (ADMIN_ACTIONS.has(action)) {
    return isAdmin(user);
  }

  if (MOD_ACTIONS.has(action)) {
    return isModOrAbove(user);
  }

  if (action === 'vote') {
    const level = user.level ?? 1;
    return level >= MIN_VOTE_LEVEL;
  }

  if (AUTH_REQUIRED.has(action)) {
    return true;
  }

  return false;
}

module.exports = {
  can,
  isGuest,
  isModOrAbove,
  isAdmin,
  STAFF_ROLES,
  AUTH_REQUIRED,
  MOD_ACTIONS,
  ADMIN_ACTIONS,
};
