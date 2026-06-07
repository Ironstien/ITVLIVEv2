const express = require('express');
const { requireAuth, requireFounder } = require('../middleware/auth');
const platform = require('../services/platform');
const { updatePlatform } = require('../services/staff');
const {
  requireConfirm,
  getDataStats,
  resetSongs,
  resetVotes,
  resetPlaySessions,
  resetXpTransactions,
  resetUserProgress,
  nuclearWipeAllUsers,
} = require('../services/founder');
const serverLog = require('../services/serverLog');
const {
  room,
  emitUserProgress,
  forceDisconnectUser,
  sessionRegistry,
  getPlayerSyncPayload,
  getRoomStatePayload,
} = require('../sockets');

const router = express.Router();

router.use(requireAuth, requireFounder);

function broadcastRoom(io) {
  if (!io) return;
  io.emit('room:state', getRoomStatePayload());
  io.emit('player:sync', getPlayerSyncPayload());
}

router.get('/stats', async (_req, res) => {
  try {
    const result = await getDataStats();
    if (result.error) {
      res.status(503).json({ error: result.error });
      return;
    }
    const settings = platform.getPlatformSettings();
    res.json({
      ok: true,
      counts: result.counts,
      platform: {
        maintenanceMode: settings.maintenanceMode,
        testDjEnabled: settings.testDjEnabled,
        testDjQueueEnabled: settings.testDjQueueEnabled,
        testDjChatEnabled: settings.testDjChatEnabled,
      },
      room: {
        nowPlaying: room.nowPlaying
          ? {
              djName: room.nowPlaying.djName,
              title: room.nowPlaying.title,
              videoId: room.nowPlaying.videoId,
            }
          : null,
        queueLength: room.djQueue?.length ?? 0,
        chatLength: room.chat?.length ?? 0,
      },
      serverLogs: serverLog.getMeta(),
    });
  } catch (err) {
    console.error('[founder] stats failed:', err.message);
    res.status(500).json({ error: 'Failed to load owner stats' });
  }
});

router.patch('/platform', async (req, res) => {
  try {
    const { maintenanceMode, testDjEnabled, testDjQueueEnabled, testDjChatEnabled } = req.body || {};
    const updates = {};
    if (maintenanceMode !== undefined) updates.maintenanceMode = Boolean(maintenanceMode);
    if (testDjEnabled !== undefined) updates.testDjEnabled = Boolean(testDjEnabled);
    if (testDjQueueEnabled !== undefined) updates.testDjQueueEnabled = Boolean(testDjQueueEnabled);
    if (testDjChatEnabled !== undefined) updates.testDjChatEnabled = Boolean(testDjChatEnabled);
    if (!Object.keys(updates).length) {
      res.status(400).json({ error: 'No platform fields to update' });
      return;
    }

    const result = await updatePlatform(req.user, updates);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    const io = req.app.get('io');
    if (io) {
      if (
        result.testDjRoom?.started ||
        result.testDjRoom?.stopped ||
        result.testDjRoom?.queueEnabled !== undefined
      ) {
        io.emit('player:sync', getPlayerSyncPayload());
      }
      broadcastRoom(io);
    }

    res.json(result);
  } catch (err) {
    console.error('[founder] platform update failed:', err.message);
    res.status(500).json({ error: 'Failed to update platform settings' });
  }
});

router.get('/logs/download', (_req, res) => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `itvlive-server-log-${stamp}.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(serverLog.exportText());
  } catch (err) {
    console.error('[founder] log download failed:', err.message);
    res.status(500).json({ error: 'Failed to export server logs' });
  }
});

router.post('/logs/clear', (_req, res) => {
  try {
    serverLog.clear();
    res.json({ ok: true, serverLogs: serverLog.getMeta() });
  } catch (err) {
    console.error('[founder] log clear failed:', err.message);
    res.status(500).json({ error: 'Failed to clear server logs' });
  }
});

router.post('/live/clear-chat', async (req, res) => {
  try {
    const result = room.founderClearChat();
    const io = req.app.get('io');
    if (io) broadcastRoom(io);
    res.json(result);
  } catch (err) {
    console.error('[founder] clear chat failed:', err.message);
    res.status(500).json({ error: 'Failed to clear chat' });
  }
});

router.post('/live/skip-song', async (req, res) => {
  try {
    const result = room.founderSkipNowPlaying();
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    const io = req.app.get('io');
    if (io) broadcastRoom(io);
    res.json(result);
  } catch (err) {
    console.error('[founder] skip song failed:', err.message);
    res.status(500).json({ error: 'Failed to skip song' });
  }
});

router.post('/live/reset-queue', async (req, res) => {
  try {
    const result = room.founderResetDjQueue();
    const io = req.app.get('io');
    if (io) broadcastRoom(io);
    res.json(result);
  } catch (err) {
    console.error('[founder] reset queue failed:', err.message);
    res.status(500).json({ error: 'Failed to reset queue' });
  }
});

router.post('/reset/songs', async (req, res) => {
  const confirmErr = requireConfirm(req.body, 'songs');
  if (confirmErr) {
    res.status(400).json(confirmErr);
    return;
  }
  try {
    const result = await resetSongs(req.user);
    res.json(result);
  } catch (err) {
    console.error('[founder] reset songs failed:', err.message);
    res.status(500).json({ error: 'Failed to reset song data' });
  }
});

router.post('/reset/votes', async (req, res) => {
  const confirmErr = requireConfirm(req.body, 'votes');
  if (confirmErr) {
    res.status(400).json(confirmErr);
    return;
  }
  try {
    const result = await resetVotes(req.user);
    res.json(result);
  } catch (err) {
    console.error('[founder] reset votes failed:', err.message);
    res.status(500).json({ error: 'Failed to reset vote data' });
  }
});

router.post('/reset/play-sessions', async (req, res) => {
  const confirmErr = requireConfirm(req.body, 'playSessions');
  if (confirmErr) {
    res.status(400).json(confirmErr);
    return;
  }
  try {
    const result = await resetPlaySessions(req.user);
    res.json(result);
  } catch (err) {
    console.error('[founder] reset play sessions failed:', err.message);
    res.status(500).json({ error: 'Failed to reset play sessions' });
  }
});

router.post('/reset/xp-transactions', async (req, res) => {
  const confirmErr = requireConfirm(req.body, 'xpTransactions');
  if (confirmErr) {
    res.status(400).json(confirmErr);
    return;
  }
  try {
    const result = await resetXpTransactions(req.user);
    res.json(result);
  } catch (err) {
    console.error('[founder] reset xp transactions failed:', err.message);
    res.status(500).json({ error: 'Failed to reset XP transactions' });
  }
});

router.post('/reset/user-progress', async (req, res) => {
  const confirmErr = requireConfirm(req.body, 'userProgress');
  if (confirmErr) {
    res.status(400).json(confirmErr);
    return;
  }
  try {
    const result = await resetUserProgress(req.user);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    room.clearAllOnlineBadges();

    const io = req.app.get('io');
    if (io) {
      for (const userId of sessionRegistry.getConnectedUserIds()) {
        room.updateUserProgressForUser(userId, { xp: 0, level: 1 });
        emitUserProgress(io, {
          userId,
          xp: 0,
          level: 1,
          badgesReset: true,
          badges: ['account_created'],
          reason: 'founder_reset_user_progress',
        });
      }
      broadcastRoom(io);
    }

    res.json(result);
  } catch (err) {
    console.error('[founder] reset user progress failed:', err.message);
    res.status(500).json({ error: 'Failed to reset user progress' });
  }
});

router.post('/reset/nuclear', async (req, res) => {
  const confirmErr = requireConfirm(req.body, 'nuclear');
  if (confirmErr) {
    res.status(400).json(confirmErr);
    return;
  }
  try {
    const result = await nuclearWipeAllUsers(req.user, { password: req.body?.password });
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    const io = req.app.get('io');
    if (io) {
      for (const userId of [...sessionRegistry.getConnectedUserIds()]) {
        forceDisconnectUser(io, userId, 'Platform reset — log in again.');
      }
      room.founderClearChat();
      room.founderResetDjQueue();
      room.founderStopPlayback();
      broadcastRoom(io);
    }

    res.json(result);
  } catch (err) {
    console.error('[founder] nuclear wipe failed:', err.message);
    res.status(500).json({ error: 'Failed to wipe platform data' });
  }
});

module.exports = router;
