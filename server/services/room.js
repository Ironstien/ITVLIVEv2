const crypto = require('crypto');
const { can } = require('../config/permissions');
const { MIN_VOTE_LEVEL } = require('../config/levels');
const { isDbConnected } = require('../config/db');
const {
  TEST_DJ_SOCKET_ID,
  TEST_DJ_USER_ID,
  TEST_DJ_DISPLAY_NAME,
  TEST_DJ_AVATAR_URL,
  isTestDjEnabled,
  getTestDjTrack,
} = require('../config/testDj');
const { parseYoutubeId, fetchYoutubeMeta } = require('./youtube');
const {
  getActivePlaylist,
  getPlaylistWithItems,
  addItem,
  movePlayedItemToBottom,
  EXPORT_URL,
} = require('./playlist');
const { createPlaySessionRecord, finalizePlaySession } = require('./session');
const platform = require('./platform');
const { isModOrAbove } = require('../config/permissions');
const { evaluateAndGrantBadgesById } = require('./badges');
const { recordChatBadgeStats, recordCrateDigger } = require('./badge-tracking');
const { User } = require('../models');

const MAX_CHAT = 80;
const MAX_MESSAGE_LEN = 280;
const DEFAULT_TRACK_DURATION_SEC = 600;
const TRACK_END_MIN_ELAPSED_RATIO = 0.8;
const CHAT_MUTE_PRESETS_MS = {
  5: 5 * 60 * 1000,
  15: 15 * 60 * 1000,
  30: 30 * 60 * 1000,
  60: 60 * 60 * 1000,
};

class Room {
  constructor() {
    /** @type {Map<string, object>} */
    this.users = new Map();
    this.chat = [];
    this.nowPlaying = null;
    /** @type {object[]} dev-only track queue */
    this.devQueue = [];
    /** @type {object[]} authenticated DJ rotation queue */
    this.djQueue = [];
    this._chatId = 0;
    this._trackEndTimer = null;
    this._onTrackEnd = null;
    /** @type {Set<string>} playSessionIds already advanced */
    this._finishedSessions = new Set();
    /** @type {Map<string, Map<string, number>>} playSessionId → userId → score intent */
    this._pendingVotes = new Map();
    /** @type {Set<string>} sessions where votes were finalized */
    this._finalizedVoteSessions = new Set();
    /** @type {number} next index in Bob McCluckn's test playlist */
    this._testDjTrackIndex = 0;
    /** @type {Map<string, { until: number }>} userId → chat mute expiry */
    this._chatMutes = new Map();
    /** @type {boolean} when true, only staff may chat */
    this._chatLocked = false;
    /** @type {string|null} DJ userId for the track that just ended */
    this._previousDjUserId = null;
    /** @type {number} authenticated listeners (excl. DJ) at last track start */
    this._listenerCountAtTrackStart = 0;

    if (isTestDjEnabled()) {
      this._ensureTestDjUser();
    }
  }

  _ensureTestDjUser() {
    if (this.users.has(TEST_DJ_SOCKET_ID)) return;
    this.users.set(TEST_DJ_SOCKET_ID, {
      socketId: TEST_DJ_SOCKET_ID,
      userId: TEST_DJ_USER_ID,
      displayName: TEST_DJ_DISPLAY_NAME,
      level: 1,
      staffRole: null,
      avatarUrl: TEST_DJ_AVATAR_URL,
      customSaying: 'Test DJ — always in the queue',
      badges: ['test'],
      inQueue: true,
      connectedAt: Date.now(),
      isTestDj: true,
    });
  }

  _isTestDjPlaying() {
    return this.nowPlaying?.socketId === TEST_DJ_SOCKET_ID;
  }

  _isTestDjSocket(socketId) {
    return socketId === TEST_DJ_SOCKET_ID;
  }

  /** Connected guests and logged-in users only (not the virtual test DJ). */
  _countRealOnlineUsers() {
    let n = 0;
    for (const user of this.users.values()) {
      if (!user.isTestDj) n += 1;
    }
    return n;
  }

  countRealOnlineUsers() {
    return this._countRealOnlineUsers();
  }

  _stopPlayback() {
    this._clearTrackEndTimer();
    this.nowPlaying = null;
  }

  _clearDjQueue() {
    for (const entry of this.djQueue) {
      if (entry.userId) this._syncUserInQueueFlags(entry.userId, false);
    }
    this.djQueue = [];
  }

  /**
   * No real listeners left — stop the stage and drop queue state so reconnects start fresh.
   * @returns {boolean} true when the room was vacated
   */
  _vacateRoomIfEmpty() {
    if (this._countRealOnlineUsers() > 0) return false;

    this._stopPlayback();
    this.devQueue = [];
    this._clearDjQueue();

    if (isTestDjEnabled()) {
      this.users.delete(TEST_DJ_SOCKET_ID);
    }

    console.log('[room] vacated — no listeners online');
    return true;
  }

  setTrackEndHandler(fn) {
    this._onTrackEnd = typeof fn === 'function' ? fn : null;
  }

  _newPlaySessionId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `ps-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  _newPlaybackSessionId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `pb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  _newQueueEntryId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `qe-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  _isTestDjUserId(userId) {
    return userId === TEST_DJ_USER_ID;
  }

  _findQueueEntryByUserId(userId) {
    if (!userId) return null;
    return this.djQueue.find((entry) => entry.userId === userId) || null;
  }

  _findOnlineUserByUserId(userId) {
    if (!userId) return null;
    for (const user of this.users.values()) {
      if (user.userId === userId && !user.isTestDj) return user;
    }
    return null;
  }

  _isUserOnline(userId) {
    return Boolean(this._findOnlineUserByUserId(userId));
  }

  /** Remove a user from the DJ queue and clear inQueue flags (e.g. disconnected before their song ended). */
  _removeQueueEntryByUserId(userId) {
    const idx = this.djQueue.findIndex((entry) => entry.userId === userId);
    if (idx === -1) return false;
    this.djQueue.splice(idx, 1);
    this._syncUserInQueueFlags(userId, false);
    return true;
  }

  _applyUserProgress(progress) {
    if (!progress?.userId) return;
    for (const user of this.users.values()) {
      if (user.userId === progress.userId) {
        user.level = progress.level ?? user.level ?? 1;
        user.xp = progress.xp ?? user.xp ?? 0;
      }
    }
  }

  _countAuthenticatedListeners(excludeUserId = null) {
    let n = 0;
    for (const user of this.users.values()) {
      if (user.isTestDj || !user.userId || !user.isAuthenticated) continue;
      if (excludeUserId && user.userId === excludeUserId) continue;
      n += 1;
    }
    return n;
  }

  _listenerUserIdsAtTrackEnd(djUserId) {
    const ids = [];
    for (const user of this.users.values()) {
      if (user.isTestDj || !user.userId || !user.isAuthenticated) continue;
      if (user.userId === djUserId) continue;
      ids.push(user.userId);
    }
    return ids;
  }

  setVoteIntent(socketId, payload = {}) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'vote')) {
      if (!user.userId) return { error: 'Log in to vote' };
      return { error: `Level ${MIN_VOTE_LEVEL}+ required to vote` };
    }
    if (!this.nowPlaying?.playSessionId) {
      return { error: 'Nothing playing' };
    }

    const sessionId = this.nowPlaying.playSessionId;
    if (this._finalizedVoteSessions.has(sessionId)) {
      return { error: 'Voting closed for this song' };
    }
    if (
      payload.playSessionId &&
      payload.playSessionId !== sessionId
    ) {
      return { error: 'Session mismatch' };
    }

    const score = Math.floor(Number(payload.score));
    if (!Number.isFinite(score) || score < 1 || score > 100) {
      return { error: 'Score must be 1–100' };
    }

    if (!this._pendingVotes.has(sessionId)) {
      this._pendingVotes.set(sessionId, new Map());
    }
    this._pendingVotes.get(sessionId).set(user.userId, score);

    return { ok: true, score, playSessionId: sessionId };
  }

  async _finalizeSession(finished) {
    const sessionId = finished.playSessionId;
    const pending = this._pendingVotes.get(sessionId) || new Map();

    const eligibleVoterIds = [];
    for (const u of this.users.values()) {
      if (u.isTestDj || !u.userId || !u.isAuthenticated) continue;
      if (u.userId === finished.userId) continue;
      eligibleVoterIds.push(u.userId);
    }

    const result = await finalizePlaySession({
      sessionKey: sessionId,
      playSessionId: finished.mongoPlaySessionId || null,
      youtubeId: finished.videoId,
      title: finished.title,
      djName: finished.djName,
      djUserId: finished.userId,
      pendingVotes: pending,
      listenerUserIds: this._listenerUserIdsAtTrackEnd(finished.userId),
      eligibleVoterIds,
      endedAt: Date.now(),
      listenerCountAtStart: this._listenerCountAtTrackStart ?? 0,
      previousDjUserId: this._previousDjUserId ?? null,
    });

    this._finalizedVoteSessions.add(sessionId);
    this._pendingVotes.delete(sessionId);
    if (this._finalizedVoteSessions.size > 50) {
      const first = this._finalizedVoteSessions.values().next().value;
      this._finalizedVoteSessions.delete(first);
    }

    for (const progress of result.progressUpdates) {
      this._applyUserProgress(progress);
    }

    return result;
  }

  _syncUserInQueueFlags(userId, inQueue) {
    for (const user of this.users.values()) {
      if (user.userId === userId) {
        user.inQueue = inQueue;
      }
    }
  }

  _rebindQueueSocket(userId, socketId) {
    const entry = this._findQueueEntryByUserId(userId);
    if (!entry) return;
    entry.socketId = socketId;
    const online = this.users.get(socketId);
    if (online) {
      entry.displayName = online.displayName;
      entry.avatarUrl = online.avatarUrl;
      entry.level = online.level ?? 1;
    }
  }

  _isRealDjPlaying() {
    return Boolean(this.nowPlaying?.userId && !this._isTestDjUserId(this.nowPlaying.userId));
  }

  _getWaitingQueueEntries() {
    if (!this.djQueue.length) return [];
    if (this._isRealDjPlaying() && this.djQueue[0]?.userId === this.nowPlaying.userId) {
      return this.djQueue.slice(1);
    }
    return [...this.djQueue];
  }

  _queueEntryToPayload(entry, position) {
    const track = entry.playlistItems?.[entry.trackIndex];
    return {
      id: entry.queueEntryId,
      userId: entry.userId,
      socketId: entry.socketId,
      djName: entry.displayName,
      title: track?.title || '—',
      videoId: track?.youtubeId || null,
      position,
      isTestDj: false,
    };
  }

  _queueEntryToVinylUser(entry) {
    return {
      userId: entry.userId,
      socketId: entry.socketId,
      displayName: entry.displayName,
      avatarUrl: entry.avatarUrl || null,
      level: entry.level ?? 1,
      staffRole: entry.staffRole ?? null,
      badges: Array.isArray(entry.badges) ? entry.badges : [],
      inQueue: true,
    };
  }

  addUser(socketId, displayName) {
    const name = String(displayName || `Guest-${socketId.slice(0, 4)}`)
      .trim()
      .slice(0, 24);
    const user = {
      socketId,
      userId: null,
      displayName: name.length >= 2 ? name : `Guest-${socketId.slice(0, 4)}`,
      level: 1,
      staffRole: null,
      avatarUrl: null,
      customSaying: '',
      badges: [],
      inQueue: false,
      connectedAt: Date.now(),
      isAuthenticated: false,
    };
    this.users.set(socketId, user);
    return user;
  }

  addUserFromAuth(socketId, authUser) {
    const user = {
      socketId,
      userId: authUser.id,
      displayName: authUser.username,
      level: authUser.level ?? 1,
      xp: authUser.xp ?? 0,
      staffRole: authUser.staffRole ?? null,
      avatarUrl: authUser.avatarUrl ?? null,
      customSaying: authUser.customSaying ?? '',
      badges: Array.isArray(authUser.badges) ? authUser.badges : [],
      inQueue: false,
      connectedAt: Date.now(),
      isAuthenticated: true,
    };
    this.users.set(socketId, user);
    if (user.userId) {
      this._rebindQueueSocket(user.userId, socketId);
    }
    return user;
  }

  _findOnlineUserByUserId(userId) {
    if (!userId) return null;
    for (const user of this.users.values()) {
      if (user.userId === userId && !user.isTestDj) return user;
    }
    return null;
  }

  _getChatMuteStatus(user) {
    if (!user?.userId) return { muted: false };
    const mute = this._chatMutes.get(user.userId);
    if (!mute) return { muted: false };

    if (mute.until && Date.now() < mute.until) {
      return { muted: true, until: mute.until };
    }

    this._chatMutes.delete(user.userId);
    return { muted: false };
  }

  getChatMutes() {
    const now = Date.now();
    const entries = [];
    for (const [userId, mute] of this._chatMutes.entries()) {
      if (!mute.until || mute.until <= now) {
        this._chatMutes.delete(userId);
        continue;
      }
      const online = this._findOnlineUserByUserId(userId);
      entries.push({
        userId,
        displayName: online?.displayName || null,
        until: mute.until,
        remainingMinutes: Math.max(1, Math.ceil((mute.until - now) / 60000)),
      });
    }
    return entries;
  }

  updateStaffRoleForUser(userId, staffRole) {
    if (!userId) return;
    for (const user of this.users.values()) {
      if (user.userId === userId) {
        user.staffRole = staffRole;
      }
    }
    for (const entry of this.djQueue) {
      if (entry.userId === userId) {
        entry.staffRole = staffRole;
      }
    }
  }

  updateUserProgressForUser(userId, { xp, level }) {
    if (!userId) return;
    for (const user of this.users.values()) {
      if (user.userId === userId) {
        if (xp != null) user.xp = xp;
        if (level != null) user.level = level;
      }
    }
    for (const entry of this.djQueue) {
      if (entry.userId === userId) {
        if (level != null) entry.level = level;
      }
    }
  }

  syncBadgesForUser(userId, badges = []) {
    if (!userId) return;
    const list = Array.isArray(badges) ? badges : [];
    for (const user of this.users.values()) {
      if (user.userId === userId) {
        user.badges = [...list];
      }
    }
    for (const entry of this.djQueue) {
      if (entry.userId === userId) {
        entry.badges = [...list];
      }
    }
  }

  clearAllOnlineBadges() {
    for (const user of this.users.values()) {
      if (user.userId) user.badges = [];
    }
    for (const entry of this.djQueue) {
      entry.badges = [];
    }
  }

  clearChat(socketId) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'clearChat')) {
      return { error: 'Moderator access required' };
    }
    const cleared = this.chat.length;
    this.chat = [];
    return { ok: true, cleared };
  }

  skipAnySong(socketId) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'skipAnySong')) {
      return { error: 'Moderator access required' };
    }
    if (!this.nowPlaying) {
      return { error: 'Nothing playing' };
    }
    const result = this._handleTrackEnd('mod-skip');
    if (!result) {
      return { error: 'Could not skip song' };
    }
    return {
      ok: true,
      skipped: {
        videoId: result.finished.videoId,
        djName: result.finished.djName,
        userId: result.finished.userId,
      },
    };
  }

  muteUser(socketId, targetUserId, durationMinutes) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'muteUser')) {
      return { error: 'Moderator access required' };
    }

    const minutes = Number(durationMinutes);
    const durationMs = CHAT_MUTE_PRESETS_MS[minutes];
    if (!durationMs) {
      return { error: 'Invalid mute duration (use 5, 15, 30, or 60 minutes)' };
    }

    const target = this._findOnlineUserByUserId(String(targetUserId || ''));
    if (!target) {
      return { error: 'Target user is not online' };
    }
    if (target.userId === user.userId) {
      return { error: 'Cannot mute yourself' };
    }

    const until = Date.now() + durationMs;
    this._chatMutes.set(target.userId, { until });

    return {
      ok: true,
      target: {
        userId: target.userId,
        displayName: target.displayName,
      },
      durationMinutes: minutes,
      until,
    };
  }

  unmuteUser(socketId, targetUserId) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'unmuteUser')) {
      return { error: 'Moderator access required' };
    }

    const id = String(targetUserId || '');
    if (!id) {
      return { error: 'Target user is required' };
    }
    if (id === user.userId) {
      return { error: 'Cannot unmute yourself' };
    }

    const mute = this._chatMutes.get(id);
    if (!mute || (mute.until && mute.until <= Date.now())) {
      this._chatMutes.delete(id);
      return { error: 'User is not muted' };
    }

    this._chatMutes.delete(id);
    const online = this._findOnlineUserByUserId(id);

    return {
      ok: true,
      target: {
        userId: id,
        displayName: online?.displayName || null,
      },
    };
  }

  removeUserFromQueue(socketId, targetUserId) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'removeFromQueue')) {
      return { error: 'Moderator access required' };
    }

    const id = String(targetUserId || '');
    const target = this._findOnlineUserByUserId(id);
    if (!target) {
      return { error: 'Target user is not online' };
    }
    if (target.userId === user.userId) {
      return { error: 'Use Leave Queue for your own slot' };
    }
    if (this.nowPlaying?.userId === target.userId) {
      return { error: 'Cannot remove the current DJ — use Skip now playing' };
    }

    const idx = this.djQueue.findIndex((entry) => entry.userId === target.userId);
    if (idx === -1) {
      return { error: 'User is not in the queue' };
    }

    this.djQueue.splice(idx, 1);
    target.inQueue = false;

    return {
      ok: true,
      target: {
        userId: target.userId,
        displayName: target.displayName,
      },
      queueLength: this.djQueue.length,
    };
  }

  deleteChatMessage(socketId, messageId) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'deleteChatMessage')) {
      return { error: 'Moderator access required' };
    }

    const id = Number(messageId);
    if (!Number.isFinite(id) || id < 1) {
      return { error: 'Invalid message ID' };
    }

    const idx = this.chat.findIndex((msg) => msg.id === id);
    if (idx === -1) {
      return { error: 'Message not found' };
    }

    const [removed] = this.chat.splice(idx, 1);
    return {
      ok: true,
      messageId: id,
      target: {
        displayName: removed.displayName,
      },
      preview: String(removed.text || '').slice(0, 80),
    };
  }

  lockChat(socketId) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'lockChat')) {
      return { error: 'Moderator access required' };
    }
    this._chatLocked = true;
    return { ok: true, chatLocked: true };
  }

  unlockChat(socketId) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'unlockChat')) {
      return { error: 'Moderator access required' };
    }
    this._chatLocked = false;
    return { ok: true, chatLocked: false };
  }

  isChatLocked() {
    return this._chatLocked;
  }

  skipIfPlayingVideo(videoId) {
    const id = String(videoId || '');
    if (!id || !this.nowPlaying || this.nowPlaying.videoId !== id) {
      return { skipped: false };
    }
    const result = this._handleTrackEnd('blocked-video');
    return { skipped: Boolean(result) };
  }

  removeUser(socketId) {
    if (this._isTestDjSocket(socketId)) return { ok: true, vacated: false };
    const user = this.users.get(socketId);
    if (user?.userId) {
      const entry = this._findQueueEntryByUserId(user.userId);
      if (entry) entry.socketId = null;
    }
    this.users.delete(socketId);
    const vacated = this._vacateRoomIfEmpty();
    return { ok: true, vacated };
  }

  setDisplayName(socketId, name) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (user.isAuthenticated) {
      return { error: 'Update your display name in account settings' };
    }
    const trimmed = String(name || '').trim().slice(0, 24);
    if (trimmed.length < 2) return { error: 'Name must be at least 2 characters' };
    user.displayName = trimmed;
    if (this.nowPlaying?.socketId === socketId) {
      this.nowPlaying.djName = trimmed;
    }
    return { ok: true };
  }

  addChat(socketId, text) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'chat')) return { error: 'Cannot chat' };

    if (this._chatLocked && !isModOrAbove(user)) {
      return { error: 'Chat is locked' };
    }

    const mute = this._getChatMuteStatus(user);
    if (mute.muted) {
      const mins = Math.max(1, Math.ceil((mute.until - Date.now()) / 60000));
      return { error: `You are muted from chat (${mins} min remaining)` };
    }

    const trimmed = String(text || '').trim().slice(0, MAX_MESSAGE_LEN);
    if (!trimmed) return { error: 'Message is empty' };

    this._chatId += 1;
    const msg = {
      id: this._chatId,
      userId: user.userId ? String(user.userId) : null,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl || null,
      level: user.level ?? 1,
      staffRole: user.staffRole ?? null,
      text: trimmed,
      at: Date.now(),
    };
    this.chat.push(msg);
    if (this.chat.length > MAX_CHAT) this.chat.shift();

    if (user.userId) {
      recordChatBadgeStats(user.userId, trimmed).catch((err) => {
        console.warn('[room] chat badge stats failed:', err.message);
      });
    }

    return { ok: true, message: msg };
  }

  /**
   * System chat line when a user earns a badge (visible to the whole room).
   * @param {string} displayName
   * @param {string} badgeName
   */
  addBadgeEarnedChat(displayName, badgeName) {
    const name = String(displayName || 'Someone').trim() || 'Someone';
    const badge = String(badgeName || 'a badge').trim() || 'a badge';
    this._chatId += 1;
    const msg = {
      id: this._chatId,
      kind: 'badge-earned',
      displayName: name,
      badgeName: badge,
      text: `${name} has just earned ${badge}`,
      at: Date.now(),
    };
    this.chat.push(msg);
    if (this.chat.length > MAX_CHAT) this.chat.shift();
    return msg;
  }

  async joinQueue(socketId) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'joinQueue')) {
      return { error: 'Log in to join the DJ queue' };
    }
    if (!isDbConnected()) {
      return { error: 'DJ queue requires database connection' };
    }
    if (this._findQueueEntryByUserId(user.userId)) {
      return { error: 'Already in queue' };
    }

    const active = await getActivePlaylist(user.userId);
    if (!active) {
      return { error: 'Set an active playlist before joining the queue' };
    }

    const { items } = await getPlaylistWithItems(user.userId, active.id);
    if (!items.length) {
      return { error: 'Active playlist is empty' };
    }

    const entry = {
      queueEntryId: this._newQueueEntryId(),
      userId: user.userId,
      socketId,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      level: user.level ?? 1,
      staffRole: user.staffRole ?? null,
      badges: Array.isArray(user.badges) ? user.badges : [],
      playlistId: active.id,
      trackIndex: 0,
      playlistItems: items,
      joinedAt: Date.now(),
    };

    user.inQueue = true;
    const queueWasEmpty = this.djQueue.length === 0;
    this.djQueue.push(entry);

    const newBadges = await evaluateAndGrantBadgesById(user.userId, { hasQueued: true });
    if (newBadges.length) {
      const fresh = await User.findById(user.userId).lean();
      if (fresh?.badges) user.badges = fresh.badges;
    }

    if (queueWasEmpty) {
      const started = await this._startQueueHead({ interruptCurrent: true });
      return {
        ok: true,
        started,
        position: 1,
        queueLength: this.djQueue.length,
        newBadges,
      };
    }

    return {
      ok: true,
      started: false,
      position: this.djQueue.length,
      queueLength: this.djQueue.length,
      newBadges,
    };
  }

  leaveQueue(socketId) {
    return this.skipOwnWaiting(socketId);
  }

  skipOwnWaiting(socketId) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'skipOwnWaiting')) {
      return { error: 'Log in to manage your queue slot' };
    }

    const idx = this.djQueue.findIndex((entry) => entry.userId === user.userId);
    if (idx === -1) {
      return { error: 'Not in queue' };
    }

    if (this.nowPlaying?.userId === user.userId) {
      return { error: 'Use skip song while you are playing' };
    }

    this.djQueue.splice(idx, 1);
    user.inQueue = false;
    return { ok: true, queueLength: this.djQueue.length };
  }

  skipOwnPlaying(socketId) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'skipOwnPlaying')) {
      return { error: 'Log in to skip your song' };
    }
    if (!this.nowPlaying) {
      return { error: 'Nothing playing' };
    }
    if (this.nowPlaying.userId !== user.userId) {
      return { error: 'Only the current DJ can skip this song' };
    }

    const result = this._handleTrackEnd('skip');
    if (!result) {
      return { error: 'Could not skip song' };
    }
    return { ok: true };
  }

  async ripTrack(socketId) {
    const user = this.users.get(socketId);
    if (!user) return { error: 'Not connected' };
    if (!can(user, 'rip')) {
      return { error: 'Log in to rip tracks' };
    }
    if (!isDbConnected()) {
      return { error: 'Rip requires database connection' };
    }
    if (!this.nowPlaying?.videoId) {
      return { error: 'Nothing playing to rip' };
    }

    const active = await getActivePlaylist(user.userId);
    if (!active) {
      return { error: 'Set an active playlist before ripping' };
    }

    const url = EXPORT_URL(this.nowPlaying.videoId);
    const item = await addItem(user.userId, active.id, url, this.nowPlaying.title);
    await recordCrateDigger(user.userId);
    return { ok: true, item, playlistId: active.id };
  }

  _clearTrackEndTimer() {
    if (this._trackEndTimer) {
      clearTimeout(this._trackEndTimer);
      this._trackEndTimer = null;
    }
  }

  _effectiveDurationSec() {
    if (!this.nowPlaying) return DEFAULT_TRACK_DURATION_SEC;
    const n = Number(this.nowPlaying.durationSec);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    return DEFAULT_TRACK_DURATION_SEC;
  }

  _scheduleTrackEndTimer() {
    this._clearTrackEndTimer();
    if (!this.nowPlaying) return;

    const durationSec = this._effectiveDurationSec();
    const endAt = this.nowPlaying.startedAt + durationSec * 1000;
    const remaining = endAt - Date.now();

    if (remaining <= 0) {
      this._handleTrackEnd('timer');
      return;
    }

    this._trackEndTimer = setTimeout(() => {
      this._trackEndTimer = null;
      this._handleTrackEnd('timer');
    }, remaining);
  }

  async startTrack({ videoId, title, djName, socketId = null, userId = null, durationSec = null }) {
    const id = parseYoutubeId(videoId);
    if (!id) return { error: 'Invalid YouTube video' };
    if (platform.isVideoBlocked(id)) {
      return { error: 'This video is blocked from the stage' };
    }

    let resolvedTitle = title || 'Untitled';
    let resolvedDuration = durationSec;

    if (!title || !resolvedDuration) {
      try {
        const meta = await fetchYoutubeMeta(id);
        if (!title) resolvedTitle = meta.title;
        if (!resolvedDuration && meta.duration) resolvedDuration = meta.duration;
      } catch (err) {
        if (!title) resolvedTitle = id;
        console.warn('[room] metadata lookup failed:', err.message);
      }
    }

    this._clearTrackEndTimer();

    this._previousDjUserId = this.nowPlaying?.userId ?? null;
    this._listenerCountAtTrackStart = this._countAuthenticatedListeners(userId);

    const playSessionId = this._newPlaySessionId();
    const playbackSessionId = this._newPlaybackSessionId();

    let mongoPlaySessionId = null;
    if (isDbConnected()) {
      const doc = await createPlaySessionRecord({
        sessionKey: playSessionId,
        youtubeId: id,
        playedByUserId: userId,
        startedAt: Date.now(),
      });
      if (doc) mongoPlaySessionId = doc._id;
    }

    this.nowPlaying = {
      videoId: id,
      title: resolvedTitle,
      djName: djName || 'Stage',
      socketId,
      userId: userId ?? null,
      startedAt: Date.now(),
      durationSec: resolvedDuration || DEFAULT_TRACK_DURATION_SEC,
      durationSource: resolvedDuration ? 'meta' : 'fallback',
      playSessionId,
      playbackSessionId,
      mongoPlaySessionId,
    };

    this._scheduleTrackEndTimer();
    return { ok: true, nowPlaying: this.nowPlaying };
  }

  async injectDevTrack({ url, videoId, title, djName, durationSec }) {
    const id = parseYoutubeId(videoId || url || '');
    if (!id) return { error: 'Invalid YouTube URL or video ID' };

    const entry = {
      videoId: id,
      title: title || null,
      djName: djName || 'Dev DJ',
      durationSec: durationSec || null,
    };

    this.devQueue.push(entry);

    if (!this.nowPlaying) {
      const next = this.devQueue.shift();
      const result = await this.startTrack(next);
      if (result.error) return result;
      return { ok: true, started: true, queueLength: this.devQueue.length };
    }

    return { ok: true, started: false, queueLength: this.devQueue.length };
  }

  _handleTrackEnd(source) {
    if (!this.nowPlaying) return null;

    const sessionId = this.nowPlaying.playSessionId;
    if (this._finishedSessions.has(sessionId)) {
      return null;
    }
    this._finishedSessions.add(sessionId);
    if (this._finishedSessions.size > 50) {
      const first = this._finishedSessions.values().next().value;
      this._finishedSessions.delete(first);
    }

    const finished = { ...this.nowPlaying };

    console.log(`[room] track end (${source})`, {
      videoId: finished.videoId,
      playSessionId: sessionId,
      userId: finished.userId,
    });

    this._clearTrackEndTimer();
    this.nowPlaying = null;

    this._finalizeSession(finished)
      .then((finalizeResult) =>
        this._advanceQueue(finished).then((advanced) => ({
          source,
          advanced,
          finished,
          finalizeResult,
        }))
      )
      .then(({ source, advanced, finished, finalizeResult }) => {
        if (this._onTrackEnd) {
          this._onTrackEnd({ source, advanced, finished, finalizeResult });
        }
      })
      .catch((err) => {
        console.error('[room] track end finalize failed:', err.message);
        this._advanceQueue(finished).then((advanced) => {
          if (this._onTrackEnd) {
            this._onTrackEnd({ source, advanced, finished, finalizeResult: null });
          }
        });
      });

    return { source, finished };
  }

  _resolvePlayedQueueTrack(entry, finished) {
    let played = entry.playlistItems[entry.trackIndex];
    if (finished?.videoId) {
      const byVideo = entry.playlistItems.find((item) => item.youtubeId === finished.videoId);
      if (byVideo) played = byVideo;
    }
    return played || null;
  }

  _rotatePlaylistItemsInMemory(entry, played) {
    const index = entry.playlistItems.findIndex(
      (item) => String(item.id) === String(played.id) || item.youtubeId === played.youtubeId
    );
    if (index === -1) return;
    const [removed] = entry.playlistItems.splice(index, 1);
    entry.playlistItems.push(removed);
    entry.trackIndex = 0;
  }

  async _rotateAfterDjTrack(finished) {
    const idx = this.djQueue.findIndex((entry) => entry.userId === finished.userId);
    if (idx === -1) return;

    const entry = this.djQueue[idx];
    const played = this._resolvePlayedQueueTrack(entry, finished);
    if (!played) {
      this._removeQueueEntryByUserId(entry.userId);
      return;
    }

    if (played.id && isDbConnected()) {
      try {
        entry.playlistItems = await movePlayedItemToBottom(
          entry.userId,
          entry.playlistId,
          played.id
        );
        entry.trackIndex = 0;
      } catch (err) {
        console.warn('[room] failed to persist playlist rotation:', err.message);
        this._rotatePlaylistItemsInMemory(entry, played);
      }
    } else {
      this._rotatePlaylistItemsInMemory(entry, played);
    }

    if (!entry.playlistItems.length) {
      this._removeQueueEntryByUserId(entry.userId);
      return;
    }

    if (!this._isUserOnline(entry.userId)) {
      this._removeQueueEntryByUserId(entry.userId);
      console.log('[room] removed offline DJ from queue after track end', entry.displayName);
      return;
    }

    this.djQueue.splice(idx, 1);
    this.djQueue.push(entry);
  }

  async _startQueueHead({ interruptCurrent = false } = {}) {
    if (!this.djQueue.length) return false;

    if (interruptCurrent && this.nowPlaying) {
      this._clearTrackEndTimer();
      this.nowPlaying = null;
    }

    while (this.djQueue.length) {
      const entry = this.djQueue[0];

      if (!this._isUserOnline(entry.userId)) {
        this.djQueue.shift();
        this._syncUserInQueueFlags(entry.userId, false);
        console.log('[room] skipped offline DJ at queue head', entry.displayName);
        continue;
      }

      const track = entry.playlistItems[entry.trackIndex];
      if (!track) {
        this.djQueue.shift();
        this._syncUserInQueueFlags(entry.userId, false);
        continue;
      }

      const online = this._findOnlineUserByUserId(entry.userId);
      entry.socketId = online.socketId;
      entry.displayName = online.displayName;
      entry.avatarUrl = online.avatarUrl;

      const result = await this.startTrack({
        videoId: track.youtubeId,
        title: track.title,
        djName: entry.displayName,
        socketId: entry.socketId,
        userId: entry.userId,
      });

      if (result.error) {
        console.warn('[room] failed to start queue head:', result.error);
        return false;
      }
      return true;
    }

    return false;
  }

  async _playTestDjTrack() {
    if (!isTestDjEnabled()) return false;
    this._ensureTestDjUser();

    const track = getTestDjTrack(this._testDjTrackIndex);
    this._testDjTrackIndex += 1;

    const result = await this.startTrack({
      videoId: track.videoId,
      title: track.title,
      djName: TEST_DJ_DISPLAY_NAME,
      socketId: TEST_DJ_SOCKET_ID,
      userId: TEST_DJ_USER_ID,
    });
    if (result.error) {
      console.warn('[room] test DJ track failed:', result.error);
      return false;
    }
    console.log('[room] test DJ now playing', track.title);
    return true;
  }

  async _advanceQueue(finished = null) {
    if (this.devQueue.length) {
      const next = this.devQueue.shift();
      const result = await this.startTrack(next);
      return !result.error;
    }

    if (finished?.userId && !this._isTestDjUserId(finished.userId)) {
      await this._rotateAfterDjTrack(finished);
    }

    if (this.djQueue.length) {
      return this._startQueueHead({ interruptCurrent: false });
    }

    if (this._countRealOnlineUsers() === 0) {
      return false;
    }

    return this._playTestDjTrack();
  }

  /** Start test DJ rotation when someone is in the room and nothing else is queued. */
  async maybeStartIdlePlayback() {
    if (!isTestDjEnabled()) return { ok: false, reason: 'disabled' };
    if (this._countRealOnlineUsers() === 0) return { ok: false, reason: 'no_audience' };
    if (this.djQueue.length) return { ok: true, started: false, reason: 'dj_queue_active' };
    if (this.nowPlaying) return { ok: true, started: false };
    return this.initTestDjPlayback();
  }

  /** Start Bob's rotation when the room is idle. */
  async initTestDjPlayback() {
    if (!isTestDjEnabled()) return { ok: false, reason: 'disabled' };
    if (this._countRealOnlineUsers() === 0) return { ok: false, reason: 'no_audience' };
    if (this.djQueue.length) return { ok: true, started: false, reason: 'dj_queue_active' };
    this._ensureTestDjUser();
    if (this.nowPlaying) return { ok: true, started: false };
    const started = await this._playTestDjTrack();
    return { ok: true, started };
  }

  validateClientTrackEnd(socketId, payload = {}) {
    if (!this.nowPlaying) return { ok: false, reason: 'idle' };

    const np = this.nowPlaying;
    if (
      payload.playbackSessionId &&
      np.playbackSessionId &&
      payload.playbackSessionId !== np.playbackSessionId
    ) {
      return { ok: false, reason: 'session_mismatch' };
    }

    if (payload.playSessionId && np.playSessionId && payload.playSessionId !== np.playSessionId) {
      return { ok: false, reason: 'session_mismatch' };
    }

    const elapsed = Date.now() - np.startedAt;
    const minElapsed = np.durationSec * 1000 * TRACK_END_MIN_ELAPSED_RATIO;
    if (elapsed < minElapsed) {
      return { ok: false, reason: 'too_early' };
    }

    return { ok: true };
  }

  handleClientTrackEnd(socketId, payload = {}) {
    const check = this.validateClientTrackEnd(socketId, payload);
    if (!check.ok) {
      console.log('[room] client player:ended ignored', check.reason);
      return check;
    }
    this._handleTrackEnd('client');
    return { ok: true };
  }

  /**
   * Correct server track timing from the YouTube iframe (authoritative video length).
   * @param {{ durationSec?: number, playbackSessionId?: string, playSessionId?: string }} payload
   */
  applyTrackDuration(payload = {}) {
    if (!this.nowPlaying) return { ok: false, reason: 'idle' };

    const np = this.nowPlaying;
    if (
      payload.playbackSessionId &&
      np.playbackSessionId &&
      payload.playbackSessionId !== np.playbackSessionId
    ) {
      return { ok: false, reason: 'session_mismatch' };
    }
    if (payload.playSessionId && np.playSessionId && payload.playSessionId !== np.playSessionId) {
      return { ok: false, reason: 'session_mismatch' };
    }

    const dur = Math.floor(Number(payload.durationSec));
    if (!Number.isFinite(dur) || dur < 1 || dur > 7200) {
      return { ok: false, reason: 'invalid_duration' };
    }

    const prev = this._effectiveDurationSec();
    const wasFallback = np.durationSource === 'fallback';
    const delta = Math.abs(prev - dur);

    if (!wasFallback && delta <= 2) {
      return { ok: true, updated: false };
    }

    this.nowPlaying.durationSec = dur;
    this.nowPlaying.durationSource = 'client';
    this._scheduleTrackEndTimer();

    console.log('[room] duration corrected', {
      videoId: np.videoId,
      from: prev,
      to: dur,
      wasFallback,
    });

    return { ok: true, updated: true, durationSec: dur };
  }

  _playbackPayloadBase() {
    const serverTime = Date.now();
    if (!this.nowPlaying) {
      return {
        videoId: null,
        title: null,
        djName: null,
        startedAt: null,
        durationSec: null,
        playSessionId: null,
        playbackSessionId: null,
        isPlaying: false,
        serverTime,
      };
    }

    const np = this.nowPlaying;
    return {
      videoId: np.videoId,
      title: np.title,
      djName: np.djName,
      startedAt: np.startedAt,
      durationSec: np.durationSec,
      playSessionId: np.playSessionId,
      playbackSessionId: np.playbackSessionId,
      isPlaying: true,
      serverTime,
    };
  }

  getPlayerSync() {
    return this._playbackPayloadBase();
  }

  _buildGlobalQueuePayload() {
    const waiting = this._getWaitingQueueEntries();
    const entries = waiting.map((entry, index) => this._queueEntryToPayload(entry, index + 1));

    if (!this.djQueue.length) {
      const devEntries = this.devQueue.map((entry, index) => ({
        id: `dev-${index}-${entry.videoId}`,
        djName: entry.djName,
        title: entry.title,
        videoId: entry.videoId,
        position: index + 1,
        isTestDj: false,
      }));
      entries.push(...devEntries);

      if (isTestDjEnabled() && !this._isTestDjPlaying() && !this._isRealDjPlaying()) {
        const upNext = getTestDjTrack(this._testDjTrackIndex);
        entries.push({
          id: TEST_DJ_SOCKET_ID,
          djName: TEST_DJ_DISPLAY_NAME,
          title: upNext.title,
          videoId: upNext.videoId,
          position: entries.length + 1,
          isTestDj: true,
        });
      }
    }

    return entries;
  }

  _buildVinylPit() {
    const activeUserId = this.nowPlaying?.userId ?? null;
    const activeSocketId = this.nowPlaying?.socketId ?? null;

    const queue = this._getWaitingQueueEntries().map((entry) => this._queueEntryToVinylUser(entry));

    const listeners = [...this.users.values()]
      .filter(
        (u) =>
          !u.isTestDj &&
          !u.inQueue &&
          u.userId !== activeUserId &&
          u.socketId !== activeSocketId
      )
      .sort(
        (a, b) =>
          (a.connectedAt || 0) - (b.connectedAt || 0) ||
          a.displayName.localeCompare(b.displayName)
      )
      .map((u) => ({
        userId: u.userId,
        socketId: u.socketId,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl || null,
        level: u.level ?? 1,
        staffRole: u.staffRole ?? null,
        badges: Array.isArray(u.badges) ? u.badges : [],
        inQueue: false,
      }));

    return { queue, listeners };
  }

  getRoomState() {
    const users = [...this.users.values()].map((u) => ({
      socketId: u.socketId,
      userId: u.userId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl || null,
      customSaying: u.customSaying || '',
      level: u.level ?? 1,
      xp: u.xp ?? 0,
      staffRole: u.staffRole ?? null,
      badges: Array.isArray(u.badges) ? u.badges : [],
      inQueue: u.inQueue,
      connectedAt: u.connectedAt ?? null,
      connected: true,
    }));

    return {
      phase: 7,
      chatLocked: this._chatLocked,
      roomBanner: platform.getRoomBanner(),
      nowPlaying: this.nowPlaying
        ? {
            socketId: this.nowPlaying.socketId,
            userId: this.nowPlaying.userId,
            djName: this.nowPlaying.djName,
            title: this.nowPlaying.title,
            videoId: this.nowPlaying.videoId,
            startedAt: this.nowPlaying.startedAt,
            durationSec: this.nowPlaying.durationSec,
            playSessionId: this.nowPlaying.playSessionId,
            playbackSessionId: this.nowPlaying.playbackSessionId,
          }
        : null,
      globalQueue: this._buildGlobalQueuePayload(),
      vinylPit: this._buildVinylPit(),
      users,
      chat: [...this.chat],
    };
  }
}

module.exports = { Room, CHAT_MUTE_PRESETS_MS };
