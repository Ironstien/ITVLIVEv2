const { Room } = require('../services/room');
const { setBadgeNotifyHandler } = require('../services/badges');
const { resolveBadgeDetails } = require('../config/badges');
const { User } = require('../models');
const { can } = require('../config/permissions');
const { verifyToken, isJwtConfigured } = require('../lib/jwt');
const { isDbConnected } = require('../config/db');
const { toSocketUser, toPublicUser, findUserDocumentById, assertUserNotBanned } = require('../services/auth');
const { isSystemAccountUser, isTestDjUserId } = require('../services/testDjAccount');
const testDjChat = require('../services/testDjChat');
const { logStaffAction } = require('../services/staffAudit');
const { SessionRegistry } = require('./sessionRegistry');

const room = new Room();
const sessionRegistry = new SessionRegistry();
const CHAT_COOLDOWN_MS = 800;
const chatLastSent = new Map();

function getPlayerSyncPayload() {
  return room.getPlayerSync();
}

function getRoomStatePayload() {
  return room.getRoomState();
}

function broadcastRoomState(io, reason = 'update') {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[socket] → room:state (${reason})`);
  }
  io.emit('room:state', getRoomStatePayload());
}

function broadcastPlayerSync(io, reason = 'update') {
  if (process.env.NODE_ENV !== 'production') {
    const p = getPlayerSyncPayload();
    console.log(`[socket] → player:sync (${reason})`, p.videoId || 'idle');
  }
  io.emit('player:sync', getPlayerSyncPayload());
}

async function resolveSocketAuthUser(token) {
  if (!token || !String(token).trim()) return null;
  if (!isJwtConfigured() || !isDbConnected()) {
    throw new Error('Auth unavailable');
  }
  const payload = verifyToken(String(token).trim());
  const doc = await findUserDocumentById(payload.sub);
  if (!doc) throw new Error('Invalid token');
  if (isSystemAccountUser(doc)) throw new Error('Invalid token');
  const banned = assertUserNotBanned(doc);
  if (banned?.error) throw new Error('Account is banned');
  return toSocketUser(toPublicUser(doc));
}

function getActorFromSocket(socket) {
  const user = room.users.get(socket.id);
  if (!user?.userId) return null;
  return {
    id: user.userId,
    username: user.displayName,
    staffRole: user.staffRole ?? null,
  };
}

async function logModAction(socket, action, result, extraDetails = null) {
  const actor = getActorFromSocket(socket);
  if (!actor || !result?.ok) return;
  const details =
    extraDetails ||
    result.details ||
    (result.durationMinutes ? { durationMinutes: result.durationMinutes } : null);
  await logStaffAction({
    actorUserId: actor.id,
    actorUsername: actor.username,
    action,
    targetUserId: result.target?.userId || null,
    targetUsername: result.target?.displayName || null,
    details,
  });
}

function announceLevelUp(io, progress) {
  if (!io || !progress?.leveledUp || !progress.userId || progress.level == null) return;
  if (isTestDjUserId(progress.userId)) return;

  resolveDisplayNameForUserId(progress.userId).then((displayName) => {
    const name = displayName || 'Someone';
    room.addLevelUpChat(name, progress.level);
    broadcastRoomState(io, 'level-up');
  });
}

function emitUserProgress(io, progress) {
  if (!io || !progress?.userId) return;
  announceLevelUp(io, progress);
  const payload = { ...progress };
  if (Array.isArray(progress.newBadges) && progress.newBadges.length && !progress.badgeUnlocks) {
    payload.badgeUnlocks = resolveBadgeDetails(progress.newBadges);
  }
  for (const sid of sessionRegistry.getSocketsForUser(progress.userId)) {
    io.to(sid).emit('user:progress', payload);
  }
}

async function resolveDisplayNameForUserId(userId) {
  for (const u of room.users.values()) {
    if (u.userId && String(u.userId) === String(userId)) {
      return u.displayName || null;
    }
  }
  if (!isDbConnected()) return null;
  try {
    const doc = await User.findById(userId).select('username').lean();
    return doc?.username || null;
  } catch {
    return null;
  }
}

function announceBadgeUnlocks(io, { userId, newBadgeIds }) {
  if (!io || !userId || !newBadgeIds?.length) return;

  resolveDisplayNameForUserId(userId).then((displayName) => {
    const name = displayName || 'Someone';
    const badgeUnlocks = resolveBadgeDetails(newBadgeIds);
    for (const b of badgeUnlocks) {
      room.addBadgeEarnedChat(name, b.name);
      testDjChat.onBadgeEarned({ userId, displayName: name, badgeName: b.name });
    }
    broadcastRoomState(io, 'badge-earned');
    emitUserProgress(io, {
      userId: String(userId),
      newBadges: newBadgeIds,
      badgeUnlocks,
    });
  });
}

function forceDisconnectUser(io, userId, message) {
  return sessionRegistry.forceDisconnect(io, userId, message);
}

function registerSockets(io) {
  setBadgeNotifyHandler((payload) => announceBadgeUnlocks(io, payload));
  testDjChat.configure({
    room,
    broadcast: () => broadcastRoomState(io, 'test-dj-chat'),
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || !String(token).trim()) {
      return next();
    }
    try {
      socket.data.authUser = await resolveSocketAuthUser(token);
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  room.setTrackEndHandler(({ finalizeResult, syncPlayback = false }) => {
    if (syncPlayback) {
      broadcastPlayerSync(io, 'track-end');
      broadcastRoomState(io, 'track-end');
    }
    if (finalizeResult?.progressUpdates?.length) {
      let refreshRoom = false;
      for (const progress of finalizeResult.progressUpdates) {
        emitUserProgress(io, progress);
        if (progress.newBadges?.length) refreshRoom = true;
      }
      if (refreshRoom) broadcastRoomState(io, 'progress-badges');
    }
  });

  io.on('connection', (socket) => {
    const authUser = socket.data.authUser;
    if (authUser) {
      sessionRegistry.claim(io, authUser.id, socket);
      console.log('[socket] connected (auth)', socket.id, authUser.username);
    } else {
      console.log('[socket] connected (guest)', socket.id);
    }

    socket.on('room:join', (payload = {}, ack) => {
      let user;
      if (authUser) {
        user = room.addUserFromAuth(socket.id, authUser);
      } else {
        const displayName = payload.displayName || payload.name;
        user = room.addUser(socket.id, displayName);
      }

      const playerSync = getPlayerSyncPayload();
      if (process.env.NODE_ENV !== 'production') {
        console.log('[socket] → player:sync (join)', playerSync.videoId || 'idle');
      }
      socket.emit('player:sync', playerSync);
      const roomState = getRoomStatePayload();
      broadcastRoomState(io, 'join');

      const result = {
        ok: true,
        displayName: user.displayName,
        socketId: socket.id,
        playerSync,
        roomState,
        authenticated: Boolean(authUser),
        userId: user.userId,
      };
      if (typeof ack === 'function') ack(result);

      room.maybeStartIdlePlayback().then((idle) => {
        if (idle?.started) {
          broadcastPlayerSync(io, 'idle-playback');
          broadcastRoomState(io, 'idle-playback');
        }
      });
    });

    socket.on('room:requestSync', (_payload, ack) => {
      const playerSync = getPlayerSyncPayload();
      if (process.env.NODE_ENV !== 'production') {
        console.log('[socket] → player:sync (requestSync)', playerSync.videoId || 'idle');
      }
      socket.emit('player:sync', playerSync);
      socket.emit('room:state', getRoomStatePayload());
      if (typeof ack === 'function') ack({ ok: true, playerSync });
    });

    socket.on('room:setName', (payload = {}, ack) => {
      const result = room.setDisplayName(socket.id, payload.displayName || payload.name);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }
      broadcastRoomState(io, 'setName');
      if (typeof ack === 'function') ack(result);
    });

    socket.on('chat:send', (payload = {}, ack) => {
      const user = room.users.get(socket.id);
      if (!can(user, 'chat')) {
        const err = { error: 'Cannot send chat' };
        if (typeof ack === 'function') ack(err);
        return;
      }

      const now = Date.now();
      const last = chatLastSent.get(socket.id) || 0;
      if (now - last < CHAT_COOLDOWN_MS) {
        const err = { error: 'Slow down' };
        if (typeof ack === 'function') ack(err);
        return;
      }
      chatLastSent.set(socket.id, now);

      const result = room.addChat(socket.id, payload.text || payload.message);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }

      broadcastRoomState(io, 'chat');
      testDjChat.onUserChat(result.message);
      if (typeof ack === 'function') ack(result);
    });

    socket.on('queue:join', async (_payload, ack) => {
      const user = room.users.get(socket.id);
      if (!can(user, 'joinQueue')) {
        const err = { error: 'Log in to join the DJ queue' };
        if (typeof ack === 'function') ack(err);
        return;
      }
      const result = await room.joinQueue(socket.id);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }
      if (result.started) {
        broadcastPlayerSync(io, 'queue-join-start');
      }
      broadcastRoomState(io, 'queue-join');
      if (typeof ack === 'function') ack(result);
    });

    socket.on('queue:leave', (_payload, ack) => {
      const user = room.users.get(socket.id);
      if (!can(user, 'leaveQueue')) {
        const err = { error: 'Log in to leave the queue' };
        if (typeof ack === 'function') ack(err);
        return;
      }
      const result = room.leaveQueue(socket.id);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }
      broadcastRoomState(io, 'queue-leave');
      if (typeof ack === 'function') ack(result);
    });

    socket.on('queue:rip', async (_payload, ack) => {
      const user = room.users.get(socket.id);
      if (!can(user, 'rip')) {
        const err = { error: 'Log in to rip tracks' };
        if (typeof ack === 'function') ack(err);
        return;
      }
      try {
        const result = await room.ripTrack(socket.id);
        if (typeof ack === 'function') ack(result);
      } catch (err) {
        if (typeof ack === 'function') ack({ error: err.message || 'Rip failed' });
      }
    });

    socket.on('queue:skipPlaying', (_payload, ack) => {
      const user = room.users.get(socket.id);
      if (!can(user, 'skipOwnPlaying')) {
        const err = { error: 'Log in to skip your song' };
        if (typeof ack === 'function') ack(err);
        return;
      }
      const result = room.skipOwnPlaying(socket.id);
      if (typeof ack === 'function') ack(result);
    });

    socket.on('queue:skipWaiting', (_payload, ack) => {
      const user = room.users.get(socket.id);
      if (!can(user, 'skipOwnWaiting')) {
        const err = { error: 'Log in to manage your queue slot' };
        if (typeof ack === 'function') ack(err);
        return;
      }
      const result = room.skipOwnWaiting(socket.id);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }
      broadcastRoomState(io, 'queue-skip-waiting');
      if (typeof ack === 'function') ack(result);
    });

    socket.on('vote:set', (payload = {}, ack) => {
      const user = room.users.get(socket.id);
      if (!can(user, 'vote')) {
        const err = { error: 'Voting requires level 2 or higher' };
        if (typeof ack === 'function') ack(err);
        return;
      }
      const result = room.setVoteIntent(socket.id, payload);
      if (typeof ack === 'function') ack(result);
    });

    socket.on('mod:clearChat', async (_payload, ack) => {
      const result = room.clearChat(socket.id);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }
      await logModAction(socket, 'clearChat', { ok: true, cleared: result.cleared }, {
        cleared: result.cleared,
      });
      broadcastRoomState(io, 'mod-clear-chat');
      if (typeof ack === 'function') ack(result);
    });

    socket.on('mod:skipSong', async (_payload, ack) => {
      const result = room.skipAnySong(socket.id);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }
      await logModAction(socket, 'skipAnySong', result, {
        videoId: result.skipped?.videoId,
        djName: result.skipped?.djName,
      });
      if (typeof ack === 'function') ack(result);
    });

    socket.on('mod:muteUser', async (payload = {}, ack) => {
      const result = room.muteUser(socket.id, payload.targetUserId, payload.durationMinutes);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }
      await logModAction(socket, 'muteUser', result);
      if (typeof ack === 'function') ack(result);
    });

    socket.on('mod:unmuteUser', async (payload = {}, ack) => {
      const result = room.unmuteUser(socket.id, payload.targetUserId);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }
      await logModAction(socket, 'unmuteUser', result);
      if (typeof ack === 'function') ack(result);
    });

    socket.on('mod:removeFromQueue', async (payload = {}, ack) => {
      const result = room.removeUserFromQueue(socket.id, payload.targetUserId);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }
      await logModAction(socket, 'removeFromQueue', result, {
        queueLength: result.queueLength,
      });
      broadcastRoomState(io, 'mod-remove-queue');
      if (typeof ack === 'function') ack(result);
    });

    socket.on('mod:deleteChatMessage', async (payload = {}, ack) => {
      const result = room.deleteChatMessage(socket.id, payload.messageId);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }
      await logModAction(socket, 'deleteChatMessage', result, {
        messageId: result.messageId,
        preview: result.preview,
      });
      broadcastRoomState(io, 'mod-delete-message');
      if (typeof ack === 'function') ack(result);
    });

    socket.on('mod:lockChat', async (_payload, ack) => {
      const result = room.lockChat(socket.id);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }
      await logModAction(socket, 'lockChat', result, { chatLocked: true });
      broadcastRoomState(io, 'mod-lock-chat');
      if (typeof ack === 'function') ack(result);
    });

    socket.on('mod:unlockChat', async (_payload, ack) => {
      const result = room.unlockChat(socket.id);
      if (result.error) {
        if (typeof ack === 'function') ack(result);
        return;
      }
      await logModAction(socket, 'unlockChat', result, { chatLocked: false });
      broadcastRoomState(io, 'mod-unlock-chat');
      if (typeof ack === 'function') ack(result);
    });

    socket.on('player:duration', (payload = {}, ack) => {
      const result = room.applyTrackDuration(payload);
      if (result.updated) {
        broadcastPlayerSync(io, 'duration-correction');
      }
      if (typeof ack === 'function') ack(result);
    });

    socket.on('player:ended', (payload = {}, ack) => {
      const result = room.handleClientTrackEnd(socket.id, payload);
      if (typeof ack === 'function') ack(result);
    });

    socket.on('disconnect', () => {
      chatLastSent.delete(socket.id);
      if (authUser) {
        sessionRegistry.release(authUser.id, socket.id);
      }
      const { vacated } = room.removeUser(socket.id);
      if (vacated) {
        broadcastPlayerSync(io, 'room-empty');
      }
      broadcastRoomState(io, 'disconnect');
      console.log('[socket] disconnected', socket.id, vacated ? '(room vacated)' : '');
    });
  });
}

module.exports = {
  registerSockets,
  room,
  getPlayerSyncPayload,
  getRoomStatePayload,
  emitUserProgress,
  forceDisconnectUser,
  sessionRegistry,
};
