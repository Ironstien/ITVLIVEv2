const platform = require('./platform');
const { isTestDjUserId } = require('./testDjAccount');
const { TEST_DJ_DISPLAY_NAME } = require('../config/testDj');

const MENTION_RE = /@bob(?:[\s_-]*mccluckn)?/i;
const IDLE_INTERVAL_MS = 8 * 60 * 1000;
const IDLE_CHANCE = 0.65;
const MENTION_REPLY_DELAY_MS = 1200;
const BADGE_COMPLIMENT_DELAY_MS = 2500;

const IDLE_LINES = [
  'Good vibes in the pit tonight.',
  'Who’s got the next banger queued up?',
  'The void is listening.',
  'Drop a score if you’re feeling this one.',
  'Queue’s moving — respect to everyone waiting their turn.',
  'Main stage energy feels right tonight.',
];

const MENTION_REPLIES = [
  'Hey — I’m here. What’s good?',
  'You rang? I’m on the decks when it’s my turn.',
  'McCluckn reporting in. Hope you’re enjoying the rotation.',
  'Always happy to chat between tracks.',
  'The pit hears you. What’s up?',
];

/** @type {import('./room').Room|null} */
let roomRef = null;
/** @type {(() => void)|null} */
let broadcastFn = null;
let idleTimer = null;
let pendingReplyTimer = null;
/** @type {{ userId: string, displayName: string, badgeName: string }[]} */
let complimentQueue = [];
let complimentTimer = null;

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function configure({ room, broadcast }) {
  roomRef = room;
  broadcastFn = typeof broadcast === 'function' ? broadcast : null;
}

function start() {
  stopIdleTimer();
  if (!platform.isTestDjChatEnabled()) return;
  idleTimer = setInterval(tickIdleChat, IDLE_INTERVAL_MS);
}

function stop() {
  stopIdleTimer();
  if (pendingReplyTimer) {
    clearTimeout(pendingReplyTimer);
    pendingReplyTimer = null;
  }
  complimentQueue = [];
  if (complimentTimer) {
    clearTimeout(complimentTimer);
    complimentTimer = null;
  }
}

function stopIdleTimer() {
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
}

function tickIdleChat() {
  if (!roomRef || !platform.isTestDjChatEnabled()) return;
  if (roomRef.countRealOnlineUsers() === 0) return;
  if (Math.random() > IDLE_CHANCE) return;
  const result = roomRef.addChatAsBob(pickRandom(IDLE_LINES));
  if (result?.ok && broadcastFn) broadcastFn();
}

function onUserChat(message) {
  if (!roomRef || !platform.isTestDjChatEnabled() || !message?.text) return;
  if (isTestDjUserId(message.userId)) return;
  if (!MENTION_RE.test(message.text)) return;

  if (pendingReplyTimer) clearTimeout(pendingReplyTimer);
  pendingReplyTimer = setTimeout(() => {
    pendingReplyTimer = null;
    if (!platform.isTestDjChatEnabled()) return;
    const result = roomRef.addChatAsBob(pickRandom(MENTION_REPLIES));
    if (result?.ok && broadcastFn) broadcastFn();
  }, MENTION_REPLY_DELAY_MS);
}

function scheduleNextCompliment() {
  if (complimentTimer || !complimentQueue.length || !roomRef) return;

  const next = complimentQueue.shift();
  const name = String(next.displayName || 'Someone').trim() || 'Someone';
  const badge = String(next.badgeName || 'a badge').trim() || 'a badge';
  const text = `@${name} nice work earning ${badge}!`;

  complimentTimer = setTimeout(() => {
    complimentTimer = null;
    if (!platform.isTestDjChatEnabled()) {
      complimentQueue = [];
      return;
    }
    const result = roomRef.addChatAsBob(text);
    if (result?.ok && broadcastFn) broadcastFn();
    scheduleNextCompliment();
  }, BADGE_COMPLIMENT_DELAY_MS);
}

function onBadgeEarned({ userId, displayName, badgeName }) {
  if (!roomRef || !platform.isTestDjChatEnabled()) return;
  if (!userId || isTestDjUserId(userId)) return;

  complimentQueue.push({
    userId: String(userId),
    displayName,
    badgeName,
  });
  scheduleNextCompliment();
}

module.exports = {
  configure,
  start,
  stop,
  onUserChat,
  onBadgeEarned,
  TEST_DJ_DISPLAY_NAME,
};
