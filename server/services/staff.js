const { User, XpTransaction } = require('../models');
const { STAFF_ROLES } = require('../config/permissions');
const { getLevelForXp } = require('../config/levels');
const { isDbConnected } = require('../config/db');
const { findUserDocumentById } = require('./auth');
const { matchesFounderAdmin } = require('../config/founderAdmins');
const { logStaffAction } = require('./staffAudit');
const { getDefaultBadgeProgressStats } = require('./badges');
const platform = require('./platform');
const { parseYoutubeId } = require('./youtube');
const { room } = require('../sockets');

function normalizeStaffRole(value) {
  if (value === null || value === undefined || value === '' || value === 'none') {
    return null;
  }
  const role = String(value).trim().toLowerCase();
  if (!STAFF_ROLES.includes(role)) {
    return { error: `Invalid staff role. Use: none, ${STAFF_ROLES.join(', ')}` };
  }
  return role;
}

async function searchUsersForStaff(query, limit = 10) {
  if (!isDbConnected()) {
    return { error: 'Database not available' };
  }

  const q = String(query || '').trim();
  if (q.length < 2) {
    return { error: 'Enter at least 2 characters to search' };
  }

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');

  const users = await User.find({
    $or: [{ username: regex }, { email: regex }],
  })
    .select('username email staffRole level xp bannedAt banReason')
    .limit(Math.min(limit, 20))
    .lean();

  return {
    ok: true,
    users: users.map((u) => ({
      id: String(u._id),
      username: u.username,
      email: u.email,
      staffRole: u.staffRole ?? null,
      level: u.level ?? 1,
      xp: u.xp ?? 0,
      isBanned: Boolean(u.bannedAt),
      banReason: u.banReason || '',
    })),
  };
}

function normalizeXpInput(value) {
  if (value === null || value === undefined || value === '') {
    return { error: 'XP value is required' };
  }
  const xp = Math.floor(Number(value));
  if (!Number.isFinite(xp) || xp < 0) {
    return { error: 'XP must be a non-negative whole number' };
  }
  return xp;
}

async function setUserXp(actor, targetUserId, xpInput) {
  if (!isDbConnected()) {
    return { error: 'Database not available' };
  }

  const xp = normalizeXpInput(xpInput);
  if (xp?.error) return xp;

  const target = await findUserDocumentById(targetUserId);
  if (!target) {
    return { error: 'User not found' };
  }

  const previousXp = target.xp ?? 0;
  const previousLevel = target.level ?? 1;
  if (previousXp === xp) {
    return {
      ok: true,
      user: {
        id: String(target._id),
        username: target.username,
        xp,
        level: target.level ?? 1,
      },
      unchanged: true,
    };
  }

  target.xp = xp;
  target.level = getLevelForXp(xp);
  await target.save();

  const delta = xp - previousXp;
  if (delta !== 0) {
    await XpTransaction.create({
      userId: target._id,
      amount: delta,
      reason: 'Admin XP adjustment',
    });
  }

  await logStaffAction({
    actorUserId: actor.id,
    actorUsername: actor.username,
    action: 'setUserXp',
    targetUserId: target._id,
    targetUsername: target.username,
    details: {
      previousXp,
      newXp: xp,
      previousLevel,
      newLevel: target.level,
      delta,
    },
  });

  return {
    ok: true,
    user: {
      id: String(target._id),
      username: target.username,
      email: target.email,
      xp: target.xp,
      level: target.level,
    },
    previousXp,
    previousLevel,
    delta,
    leveledUp: target.level > previousLevel,
    leveledDown: target.level < previousLevel,
  };
}

async function assignStaffRole(actor, targetUserId, staffRoleInput) {
  if (!isDbConnected()) {
    return { error: 'Database not available' };
  }

  const staffRole = normalizeStaffRole(staffRoleInput);
  if (staffRole?.error) return staffRole;

  const target = await findUserDocumentById(targetUserId);
  if (!target) {
    return { error: 'User not found' };
  }

  if (matchesFounderAdmin(target) && staffRole !== 'admin') {
    return { error: 'Cannot change the role of a founder admin account' };
  }

  const previousRole = target.staffRole ?? null;
  if (previousRole === staffRole) {
    return {
      ok: true,
      user: {
        id: String(target._id),
        username: target.username,
        staffRole,
      },
      unchanged: true,
    };
  }

  target.staffRole = staffRole;
  await target.save();

  await logStaffAction({
    actorUserId: actor.id,
    actorUsername: actor.username,
    action: 'assignStaffRole',
    targetUserId: target._id,
    targetUsername: target.username,
    details: { previousRole, newRole: staffRole },
  });

  return {
    ok: true,
    user: {
      id: String(target._id),
      username: target.username,
      email: target.email,
      staffRole,
    },
    previousRole,
  };
}

async function resetUserBadgeData(actor, targetUserId) {
  if (!isDbConnected()) return { error: 'Database not available' };

  const target = await findUserDocumentById(targetUserId);
  if (!target) return { error: 'User not found' };

  const previous = {
    badgeCount: Array.isArray(target.badges) ? target.badges.length : 0,
    badgeIds: [...(target.badges || [])],
    stats: { ...(target.stats || {}) },
  };

  target.badges = [];
  target.stats = getDefaultBadgeProgressStats();
  await target.save();

  await logStaffAction({
    actorUserId: actor.id,
    actorUsername: actor.username,
    action: 'resetUserBadges',
    targetUserId: target._id,
    targetUsername: target.username,
    details: { previousBadgeCount: previous.badgeCount },
  });

  return {
    ok: true,
    user: {
      id: String(target._id),
      username: target.username,
      badges: [],
    },
    previous,
  };
}

async function resetAllUsersBadgeData(actor) {
  if (!isDbConnected()) return { error: 'Database not available' };

  const defaultStats = getDefaultBadgeProgressStats();
  const result = await User.updateMany({}, { $set: { badges: [], stats: defaultStats } });

  await logStaffAction({
    actorUserId: actor.id,
    actorUsername: actor.username,
    action: 'resetAllUserBadges',
    targetUserId: null,
    targetUsername: null,
    details: { usersModified: result.modifiedCount ?? 0 },
  });

  return {
    ok: true,
    usersModified: result.modifiedCount ?? 0,
  };
}

async function resetUserStats(actor, targetUserId) {
  if (!isDbConnected()) return { error: 'Database not available' };

  const target = await findUserDocumentById(targetUserId);
  if (!target) return { error: 'User not found' };
  if (target.staffRole === 'admin' || matchesFounderAdmin(target)) {
    return { error: 'Cannot reset an admin account' };
  }

  const previous = {
    xp: target.xp ?? 0,
    level: target.level ?? 1,
    stats: { ...(target.stats || {}) },
  };

  target.xp = 0;
  target.level = 1;
  target.stats = {
    totalPlays: 0,
    totalListens: 0,
    totalVotesGiven: 0,
    totalVotesReceived: 0,
    avgScoreReceived: 0,
  };
  await target.save();
  await XpTransaction.deleteMany({ userId: target._id });

  await logStaffAction({
    actorUserId: actor.id,
    actorUsername: actor.username,
    action: 'resetUserStats',
    targetUserId: target._id,
    targetUsername: target.username,
    details: { previousXp: previous.xp, previousLevel: previous.level },
  });

  return {
    ok: true,
    user: {
      id: String(target._id),
      username: target.username,
      xp: 0,
      level: 1,
    },
    previous,
  };
}

async function setAccountBan(actor, targetUserId, { banned, reason = '' } = {}) {
  if (!isDbConnected()) return { error: 'Database not available' };

  const target = await findUserDocumentById(targetUserId);
  if (!target) return { error: 'User not found' };
  if (target.staffRole === 'admin' || matchesFounderAdmin(target)) {
    return { error: 'Cannot ban an admin account' };
  }
  if (String(target._id) === String(actor.id)) {
    return { error: 'Cannot ban yourself' };
  }

  const wasBanned = Boolean(target.bannedAt);
  const nextBanned = Boolean(banned);

  if (wasBanned === nextBanned) {
    return {
      ok: true,
      user: {
        id: String(target._id),
        username: target.username,
        isBanned: wasBanned,
      },
      unchanged: true,
    };
  }

  if (nextBanned) {
    target.bannedAt = new Date();
    target.banReason = String(reason || '').trim().slice(0, 300);
  } else {
    target.bannedAt = null;
    target.banReason = '';
  }
  await target.save();

  const action = nextBanned ? 'accountBan' : 'unbanAccount';
  await logStaffAction({
    actorUserId: actor.id,
    actorUsername: actor.username,
    action,
    targetUserId: target._id,
    targetUsername: target.username,
    details: nextBanned ? { reason: target.banReason } : { previousReason: reason || null },
  });

  return {
    ok: true,
    user: {
      id: String(target._id),
      username: target.username,
      isBanned: nextBanned,
      banReason: target.banReason || '',
    },
    disconnected: nextBanned,
  };
}

async function blockVideo(actor, videoInput, reason = '') {
  const result = await platform.addBlockedVideo(videoInput, {
    reason,
    blockedByUserId: actor.id,
  });
  if (result.error) return result;

  await logStaffAction({
    actorUserId: actor.id,
    actorUsername: actor.username,
    action: 'blockVideo',
    details: {
      youtubeId: result.video.youtubeId,
      title: result.video.title,
      reason: result.video.reason || reason || '',
    },
  });

  return result;
}

async function unblockVideo(actor, videoInput) {
  const id = parseYoutubeId(videoInput) || String(videoInput || '').trim();
  const result = await platform.removeBlockedVideo(id);
  if (result.error) return result;

  await logStaffAction({
    actorUserId: actor.id,
    actorUsername: actor.username,
    action: 'unblockVideo',
    details: { youtubeId: result.youtubeId },
  });

  return result;
}

async function updatePlatform(actor, updates) {
  const previous = platform.getPlatformSettings();
  const result = await platform.updatePlatformSettings(updates);
  if (result.error) return result;

  let testDjRoom = null;
  if (updates.testDjEnabled !== undefined && previous.testDjEnabled !== result.settings.testDjEnabled) {
    testDjRoom = await room.applyTestDjSetting(result.settings.testDjEnabled);
  }

  await logStaffAction({
    actorUserId: actor.id,
    actorUsername: actor.username,
    action: 'managePlatform',
    details: {
      previousMaintenanceMode: previous.maintenanceMode,
      maintenanceMode: result.settings.maintenanceMode,
      maintenanceMessage: result.settings.maintenanceMessage,
      alertsBannerMessage: result.settings.alertsBannerMessage,
      previousTestDjEnabled: previous.testDjEnabled,
      testDjEnabled: result.settings.testDjEnabled,
    },
  });

  return { ...result, testDjRoom };
}

async function migrateLegacyStaffRoles() {
  if (!isDbConnected()) return { ok: true, modifiedCount: 0 };

  let modifiedCount = 0;
  const resident = await User.updateMany({ staffRole: 'resident' }, { $set: { staffRole: null } });
  modifiedCount += resident.modifiedCount;

  const invalid = await User.updateMany(
    { staffRole: { $exists: true, $nin: [null, 'mod', 'admin'] } },
    { $set: { staffRole: null } }
  );
  modifiedCount += invalid.modifiedCount;

  if (modifiedCount > 0) {
    console.log(`[staff] cleared ${modifiedCount} legacy or invalid staff role(s)`);
  }
  return { ok: true, modifiedCount };
}

module.exports = {
  assignStaffRole,
  setUserXp,
  resetUserBadgeData,
  resetAllUsersBadgeData,
  resetUserStats,
  setAccountBan,
  blockVideo,
  unblockVideo,
  updatePlatform,
  searchUsersForStaff,
  normalizeStaffRole,
  normalizeXpInput,
  migrateLegacyStaffRoles,
};
