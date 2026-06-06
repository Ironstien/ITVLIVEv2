const express = require('express');
const { requireAuth, requireStaff, requireAdmin } = require('../middleware/auth');
const { can } = require('../config/permissions');
const { getRecentStaffAuditLog } = require('../services/staffAudit');
const {
  assignStaffRole,
  setUserXp,
  resetUserStats,
  resetUserBadgeData,
  resetAllUsersBadgeData,
  setAccountBan,
  blockVideo,
  unblockVideo,
  updatePlatform,
  searchUsersForStaff,
} = require('../services/staff');
const platform = require('../services/platform');
const { room, emitUserProgress, forceDisconnectUser, sessionRegistry } = require('../sockets');
const { logStaffAction } = require('../services/staffAudit');
const { setManualBadge } = require('../services/badges');
const { MANUAL_BADGE_IDS, getBadgeDefinition } = require('../config/badges');
const { getReportsMeta, getReportsFilePath } = require('../services/bugReports');

const router = express.Router();

router.use(requireAuth);

router.get('/chat-mutes', requireStaff, (_req, res) => {
  res.json({ ok: true, mutes: room.getChatMutes(), chatLocked: room.isChatLocked() });
});

router.get('/online-users', requireAdmin, (_req, res) => {
  const users = [...room.users.values()]
    .filter((u) => u.userId)
    .map((u) => ({
      userId: u.userId,
      displayName: u.displayName,
      staffRole: u.staffRole ?? null,
      inQueue: Boolean(u.inQueue),
    }));
  res.json({ ok: true, users });
});

router.get('/platform', requireAdmin, async (_req, res) => {
  try {
    const settings = platform.getPlatformSettings();
    const blocked = await platform.listBlockedVideos(50);
    const bugReports = getReportsMeta();
    if (blocked.error) {
      res.status(503).json({ error: blocked.error });
      return;
    }
    res.json({ ok: true, settings, blockedVideos: blocked.videos, bugReports });
  } catch (err) {
    console.error('[admin] platform read failed:', err.message);
    res.status(500).json({ error: 'Failed to load platform settings' });
  }
});

router.get('/bug-reports/download', requireAdmin, (_req, res) => {
  const filePath = getReportsFilePath();
  if (!filePath) {
    res.status(404).json({ error: 'No bug reports yet' });
    return;
  }
  res.download(filePath, 'bug-reports.jsonl');
});

router.patch('/platform', requireAdmin, async (req, res) => {
  if (!can(req.user, 'managePlatform')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  try {
    const result = await updatePlatform(req.user, req.body || {});
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    const io = req.app.get('io');
    if (io) {
      if (result.testDjRoom?.started || result.testDjRoom?.stopped) {
        io.emit('player:sync', room.getPlayerSync());
      }
      io.emit('room:state', room.getRoomState());
    }
    res.json(result);
  } catch (err) {
    console.error('[admin] platform update failed:', err.message);
    res.status(500).json({ error: 'Failed to update platform settings' });
  }
});

router.post('/videos/block', requireAdmin, async (req, res) => {
  if (!can(req.user, 'blockVideo')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  try {
    const result = await blockVideo(req.user, req.body?.videoId || req.body?.url, req.body?.reason);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    const skip = room.skipIfPlayingVideo(result.video.youtubeId);
    const io = req.app.get('io');
    if (io) {
      if (skip.skipped) {
        io.emit('player:sync', room.getPlayerSync());
      }
      io.emit('room:state', room.getRoomState());
    }
    res.json({ ...result, skippedNowPlaying: skip.skipped });
  } catch (err) {
    console.error('[admin] block video failed:', err.message);
    res.status(500).json({ error: 'Failed to block video' });
  }
});

router.delete('/videos/:videoId', requireAdmin, async (req, res) => {
  if (!can(req.user, 'unblockVideo')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  try {
    const result = await unblockVideo(req.user, req.params.videoId);
    if (result.error) {
      res.status(result.error === 'Video is not blocked' ? 404 : 400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('[admin] unblock video failed:', err.message);
    res.status(500).json({ error: 'Failed to unblock video' });
  }
});

router.get('/audit-log', requireAuth, async (req, res) => {
  const scope = String(req.query.scope || 'mod').toLowerCase();
  if (scope !== 'mod' && scope !== 'admin') {
    res.status(400).json({ error: 'scope must be mod or admin' });
    return;
  }
  if (scope === 'admin') {
    if (!can(req.user, 'assignStaffRole')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
  } else if (!can(req.user, 'clearChat')) {
    res.status(403).json({ error: 'Staff access required' });
    return;
  }

  try {
    const limit = Number(req.query.limit) || 50;
    const result = await getRecentStaffAuditLog(limit, scope);
    if (result.error) {
      res.status(503).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('[admin] audit-log failed:', err.message);
    res.status(500).json({ error: 'Failed to load audit log' });
  }
});

router.get('/users/search', requireAdmin, async (req, res) => {
  if (!can(req.user, 'assignStaffRole')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  try {
    const result = await searchUsersForStaff(req.query.q);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('[admin] user search failed:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.patch('/users/:userId/xp', requireAdmin, async (req, res) => {
  if (!can(req.user, 'setUserXp')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  try {
    const result = await setUserXp(req.user, req.params.userId, req.body?.xp);
    if (result.error) {
      res.status(result.error === 'User not found' ? 404 : 400).json({ error: result.error });
      return;
    }

    if (!result.unchanged) {
      room.updateUserProgressForUser(result.user.id, {
        xp: result.user.xp,
        level: result.user.level,
      });

      const io = req.app.get('io');
      if (io) {
        emitUserProgress(io, {
          userId: result.user.id,
          xp: result.user.xp,
          level: result.user.level,
          delta: result.delta,
          reason: 'admin_adjustment',
          leveledUp: result.leveledUp,
          leveledDown: result.leveledDown,
        });
        io.emit('room:state', room.getRoomState());
      }
    }

    res.json(result);
  } catch (err) {
    console.error('[admin] set user xp failed:', err.message);
    res.status(500).json({ error: 'Failed to set user XP' });
  }
});

router.patch('/users/:userId/staff-role', requireAdmin, async (req, res) => {
  if (!can(req.user, 'assignStaffRole')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  try {
    const result = await assignStaffRole(req.user, req.params.userId, req.body?.staffRole);
    if (result.error) {
      res.status(result.error === 'User not found' ? 404 : 400).json({ error: result.error });
      return;
    }

    room.updateStaffRoleForUser(result.user.id, result.user.staffRole);

    const io = req.app.get('io');
    if (io) {
      io.emit('room:state', room.getRoomState());
    }

    res.json(result);
  } catch (err) {
    console.error('[admin] assign staff role failed:', err.message);
    res.status(500).json({ error: 'Failed to assign staff role' });
  }
});

router.post('/users/:userId/reset-badges', requireAdmin, async (req, res) => {
  if (!can(req.user, 'resetUserBadges')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  try {
    const result = await resetUserBadgeData(req.user, req.params.userId);
    if (result.error) {
      res.status(result.error === 'User not found' ? 404 : 400).json({ error: result.error });
      return;
    }

    room.syncBadgesForUser(result.user.id, []);

    const io = req.app.get('io');
    if (io) {
      emitUserProgress(io, {
        userId: result.user.id,
        badgesReset: true,
        badges: [],
      });
      io.emit('room:state', room.getRoomState());
    }

    res.json(result);
  } catch (err) {
    console.error('[admin] reset user badges failed:', err.message);
    res.status(500).json({ error: 'Failed to reset user badges' });
  }
});

router.post('/badges/reset-all', requireAdmin, async (req, res) => {
  if (!can(req.user, 'resetAllUserBadges')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  const confirm = String(req.body?.confirm || '').trim();
  if (confirm !== 'RESET_ALL_BADGES') {
    res.status(400).json({
      error: 'Confirmation required',
      hint: 'Send { "confirm": "RESET_ALL_BADGES" } in the request body',
    });
    return;
  }
  try {
    const result = await resetAllUsersBadgeData(req.user);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    room.clearAllOnlineBadges();

    const io = req.app.get('io');
    if (io) {
      for (const userId of sessionRegistry.getConnectedUserIds()) {
        emitUserProgress(io, { userId, badgesReset: true, badges: [] });
      }
      io.emit('room:state', room.getRoomState());
    }

    res.json(result);
  } catch (err) {
    console.error('[admin] reset all badges failed:', err.message);
    res.status(500).json({ error: 'Failed to reset all badge data' });
  }
});

router.post('/users/:userId/reset-stats', requireAdmin, async (req, res) => {
  if (!can(req.user, 'resetUserStats')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  try {
    const result = await resetUserStats(req.user, req.params.userId);
    if (result.error) {
      res.status(result.error === 'User not found' ? 404 : 400).json({ error: result.error });
      return;
    }

    room.updateUserProgressForUser(result.user.id, { xp: 0, level: 1 });

    const io = req.app.get('io');
    if (io) {
      emitUserProgress(io, {
        userId: result.user.id,
        xp: 0,
        level: 1,
        delta: -(result.previous?.xp ?? 0),
        reason: 'admin_reset',
        leveledDown: (result.previous?.level ?? 1) > 1,
      });
      io.emit('room:state', room.getRoomState());
    }

    res.json(result);
  } catch (err) {
    console.error('[admin] reset stats failed:', err.message);
    res.status(500).json({ error: 'Failed to reset user stats' });
  }
});

router.patch('/users/:userId/ban', requireAdmin, async (req, res) => {
  try {
    const banned = req.body?.banned !== false;
    if (banned && !can(req.user, 'accountBan')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    if (!banned && !can(req.user, 'unbanAccount')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const result = await setAccountBan(req.user, req.params.userId, {
      banned,
      reason: req.body?.reason,
    });
    if (result.error) {
      res.status(result.error === 'User not found' ? 404 : 400).json({ error: result.error });
      return;
    }

    const io = req.app.get('io');
    if (io && banned && !result.unchanged) {
      forceDisconnectUser(io, req.params.userId, 'Your account has been banned.');
    }

    res.json(result);
  } catch (err) {
    console.error('[admin] ban user failed:', err.message);
    res.status(500).json({ error: 'Failed to update ban status' });
  }
});

router.post('/users/:userId/disconnect', requireAdmin, async (req, res) => {
  if (!can(req.user, 'forceDisconnect')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  try {
    const io = req.app.get('io');
    const disconnected = io
      ? forceDisconnectUser(io, req.params.userId, req.body?.message || 'Disconnected by staff.')
      : false;
    if (!disconnected) {
      res.status(404).json({ error: 'User is not connected' });
      return;
    }

    const online = [...room.users.values()].find(
      (u) => u.userId === String(req.params.userId)
    );
    await logStaffAction({
      actorUserId: req.user.id,
      actorUsername: req.user.username,
      action: 'forceDisconnect',
      targetUserId: req.params.userId,
      targetUsername: online?.displayName || null,
      details: null,
    });

    res.json({ ok: true, disconnected: true });
  } catch (err) {
    console.error('[admin] force disconnect failed:', err.message);
    res.status(500).json({ error: 'Failed to disconnect user' });
  }
});

router.post('/users/:userId/badges', requireAdmin, async (req, res) => {
  if (!can(req.user, 'assignStaffRole')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const badgeId = String(req.body?.badgeId || '').trim();
  const action = req.body?.action === 'revoke' ? 'revoke' : 'grant';

  if (!badgeId) {
    res.status(400).json({ error: 'badgeId required' });
    return;
  }

  const def = getBadgeDefinition(badgeId);
  if (!def) {
    res.status(400).json({ error: 'Unknown badge id' });
    return;
  }

  if (action === 'grant' && !MANUAL_BADGE_IDS.includes(badgeId)) {
    res.status(400).json({
      error: 'Only manual tier-6 badges can be granted via admin',
      manualBadgeIds: MANUAL_BADGE_IDS,
    });
    return;
  }

  try {
    const result = await setManualBadge(req.params.userId, badgeId, action);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    await logStaffAction({
      actorUserId: req.user.id,
      actorUsername: req.user.username,
      action: action === 'grant' ? 'grantBadge' : 'revokeBadge',
      targetUserId: req.params.userId,
      targetUsername: null,
      details: badgeId,
    });

    res.json(result);
  } catch (err) {
    console.error('[admin] badge update failed:', err.message);
    res.status(500).json({ error: 'Failed to update badge' });
  }
});

module.exports = router;
