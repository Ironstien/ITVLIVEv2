const { BlockedVideo, PlatformSettings } = require('../models');
const { isDbConnected } = require('../config/db');
const { parseYoutubeId } = require('./youtube');
const { getEnvTestDjDefault } = require('../config/testDj');

const SETTINGS_KEY = 'global';

/** @type {Set<string>} */
let blockedVideoIds = new Set();
/** @type {{ maintenanceMode: boolean, maintenanceMessage: string, alertsBannerMessage: string, testDjEnabled: boolean, xpMultiplier: number }} */
let settings = {
  maintenanceMode: false,
  maintenanceMessage: '',
  alertsBannerMessage: '',
  testDjEnabled: false,
  xpMultiplier: 1,
};

const MAX_XP_MULTIPLIER = 100;

function normalizeXpMultiplier(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_XP_MULTIPLIER);
}

async function loadPlatformState() {
  blockedVideoIds = new Set();
  settings = {
    maintenanceMode: false,
    maintenanceMessage: '',
    alertsBannerMessage: '',
    testDjEnabled: getEnvTestDjDefault(),
    xpMultiplier: 1,
  };

  if (!isDbConnected()) return;

  const rows = await BlockedVideo.find({}).select('youtubeId').lean();
  for (const row of rows) {
    if (row.youtubeId) blockedVideoIds.add(String(row.youtubeId));
  }

  let doc = await PlatformSettings.findOne({ key: SETTINGS_KEY });
  if (!doc) {
    doc = await PlatformSettings.create({
      key: SETTINGS_KEY,
      testDjEnabled: getEnvTestDjDefault(),
    });
  }
  settings = {
    maintenanceMode: Boolean(doc.maintenanceMode),
    maintenanceMessage: String(doc.maintenanceMessage || '').trim(),
    alertsBannerMessage: String(doc.alertsBannerMessage || '').trim(),
    testDjEnabled: Boolean(doc.testDjEnabled),
    xpMultiplier: normalizeXpMultiplier(doc.xpMultiplier ?? 1),
  };
}

function isVideoBlocked(videoId) {
  if (!videoId) return false;
  return blockedVideoIds.has(String(videoId));
}

function isTestDjEnabled() {
  return Boolean(settings.testDjEnabled);
}

function getXpMultiplier() {
  return normalizeXpMultiplier(settings.xpMultiplier ?? 1);
}

function getPlatformSettings() {
  return {
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage,
    alertsBannerMessage: settings.alertsBannerMessage,
    testDjEnabled: settings.testDjEnabled,
    xpMultiplier: getXpMultiplier(),
    blockedVideoCount: blockedVideoIds.size,
  };
}

function getRoomBanner() {
  if (settings.maintenanceMode) {
    const message = settings.maintenanceMessage || 'The stage is in maintenance mode.';
    return { type: 'maintenance', message };
  }
  const message = settings.alertsBannerMessage;
  if (!message) return null;
  return { type: 'alerts', message };
}

async function listBlockedVideos(limit = 50) {
  if (!isDbConnected()) return { error: 'Database not available' };
  const rows = await BlockedVideo.find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 100))
    .lean();
  return {
    ok: true,
    videos: rows.map((row) => ({
      id: String(row._id),
      youtubeId: row.youtubeId,
      title: row.title || null,
      reason: row.reason || '',
      createdAt: row.createdAt,
    })),
  };
}

async function addBlockedVideo(youtubeId, { title = null, reason = '', blockedByUserId = null } = {}) {
  if (!isDbConnected()) return { error: 'Database not available' };
  const id = parseYoutubeId(youtubeId);
  if (!id) return { error: 'Invalid YouTube video ID or URL' };

  try {
    const doc = await BlockedVideo.findOneAndUpdate(
      { youtubeId: id },
      {
        youtubeId: id,
        title: title ? String(title).slice(0, 200) : null,
        reason: String(reason || '').trim().slice(0, 300),
        blockedByUserId: blockedByUserId || null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    blockedVideoIds.add(id);
    return {
      ok: true,
      video: {
        id: String(doc._id),
        youtubeId: doc.youtubeId,
        title: doc.title || null,
        reason: doc.reason || '',
      },
    };
  } catch (err) {
    return { error: err.message || 'Failed to block video' };
  }
}

async function removeBlockedVideo(youtubeId) {
  if (!isDbConnected()) return { error: 'Database not available' };
  const id = parseYoutubeId(youtubeId) || String(youtubeId || '').trim();
  if (!id) return { error: 'Video ID is required' };

  const doc = await BlockedVideo.findOneAndDelete({ youtubeId: id });
  blockedVideoIds.delete(id);
  if (!doc) return { error: 'Video is not blocked' };
  return { ok: true, youtubeId: id };
}

async function updatePlatformSettings(updates = {}) {
  if (!isDbConnected()) return { error: 'Database not available' };

  const patch = {};
  if (updates.maintenanceMode !== undefined) {
    patch.maintenanceMode = Boolean(updates.maintenanceMode);
  }
  if (updates.maintenanceMessage !== undefined) {
    patch.maintenanceMessage = String(updates.maintenanceMessage || '').trim().slice(0, 500);
  }
  if (updates.alertsBannerMessage !== undefined) {
    patch.alertsBannerMessage = String(updates.alertsBannerMessage || '').trim().slice(0, 500);
  }
  if (updates.testDjEnabled !== undefined) {
    patch.testDjEnabled = Boolean(updates.testDjEnabled);
  }
  if (updates.xpMultiplier !== undefined) {
    const normalized = normalizeXpMultiplier(updates.xpMultiplier);
    if (!Number.isFinite(Number(updates.xpMultiplier)) || Number(updates.xpMultiplier) < 1) {
      return { error: 'XP multiplier must be at least 1' };
    }
    patch.xpMultiplier = normalized;
  }

  const doc = await PlatformSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  settings = {
    maintenanceMode: Boolean(doc.maintenanceMode),
    maintenanceMessage: String(doc.maintenanceMessage || '').trim(),
    alertsBannerMessage: String(doc.alertsBannerMessage || '').trim(),
    testDjEnabled: Boolean(doc.testDjEnabled),
    xpMultiplier: normalizeXpMultiplier(doc.xpMultiplier ?? 1),
  };

  return { ok: true, settings: getPlatformSettings() };
}

module.exports = {
  loadPlatformState,
  isVideoBlocked,
  isTestDjEnabled,
  getXpMultiplier,
  getPlatformSettings,
  getRoomBanner,
  listBlockedVideos,
  addBlockedVideo,
  removeBlockedVideo,
  updatePlatformSettings,
};
