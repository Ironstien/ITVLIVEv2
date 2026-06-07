const { User, Playlist } = require('../models');
const { isDbConnected } = require('../config/db');
const { getPlaylistWithItems, movePlayedItemToBottom } = require('./playlist');

const TEST_DJ_SOURCE_EMAIL = (
  process.env.TEST_DJ_SOURCE_EMAIL ||
  process.env.SEED_ADMIN_EMAIL ||
  'ptvanw@gmail.com'
)
  .trim()
  .toLowerCase();

const TEST_DJ_SOURCE_PLAYLIST_NAME = (
  process.env.TEST_DJ_SOURCE_PLAYLIST_NAME || 'Bobsplaylist'
).trim();

/** @type {{ ownerUserId: string, ownerEmail: string, playlistId: string, playlistName: string }|null} */
let cachedSource = null;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clearTestDjSourceCache() {
  cachedSource = null;
}

async function resolveTestDjSourcePlaylist({ force = false } = {}) {
  if (!isDbConnected()) return null;
  if (!force && cachedSource) return cachedSource;

  const owner = await User.findOne({ email: TEST_DJ_SOURCE_EMAIL })
    .select('_id email username')
    .lean();
  if (!owner) {
    console.warn('[testDj] source playlist owner not found:', TEST_DJ_SOURCE_EMAIL);
    cachedSource = null;
    return null;
  }

  const playlist = await Playlist.findOne({
    userId: owner._id,
    name: { $regex: new RegExp(`^${escapeRegex(TEST_DJ_SOURCE_PLAYLIST_NAME)}$`, 'i') },
  })
    .select('_id name')
    .lean();

  if (!playlist) {
    console.warn(
      '[testDj] source playlist not found:',
      TEST_DJ_SOURCE_PLAYLIST_NAME,
      'for',
      TEST_DJ_SOURCE_EMAIL
    );
    cachedSource = null;
    return null;
  }

  cachedSource = {
    ownerUserId: String(owner._id),
    ownerEmail: TEST_DJ_SOURCE_EMAIL,
    playlistId: String(playlist._id),
    playlistName: playlist.name,
  };
  return cachedSource;
}

/**
 * Load Bob's queue tracks from the owner's Bobsplaylist in MongoDB.
 * @returns {Promise<{ playlistId: string|null, items: object[] }>}
 */
async function getTestDjPlaylistItems() {
  const source = await resolveTestDjSourcePlaylist();
  if (!source) {
    return { playlistId: null, items: [] };
  }

  const { items } = await getPlaylistWithItems(source.ownerUserId, source.playlistId);
  return {
    playlistId: source.playlistId,
    items: items.map((item) => ({
      id: item.id,
      youtubeId: item.youtubeId,
      title: item.title,
    })),
  };
}

async function isTestDjSourcePlaylist(userId, playlistId) {
  const source = await resolveTestDjSourcePlaylist();
  if (!source || !userId || !playlistId) return false;
  return (
    String(userId) === source.ownerUserId && String(playlistId) === source.playlistId
  );
}

/**
 * Move Bob's just-played track to the bottom of the source Bobsplaylist (same as real DJ rotation).
 * @param {string} itemId
 * @returns {Promise<{ playlistId: string, items: object[] }|null>}
 */
async function rotateTestDjPlayedItemToBottom(itemId) {
  const source = await resolveTestDjSourcePlaylist();
  if (!source || !itemId || !isDbConnected()) return null;

  const items = await movePlayedItemToBottom(
    source.ownerUserId,
    source.playlistId,
    itemId
  );

  return {
    playlistId: source.playlistId,
    items: items.map((item) => ({
      id: item.id,
      youtubeId: item.youtubeId,
      title: item.title,
    })),
  };
}

module.exports = {
  TEST_DJ_SOURCE_EMAIL,
  TEST_DJ_SOURCE_PLAYLIST_NAME,
  clearTestDjSourceCache,
  resolveTestDjSourcePlaylist,
  getTestDjPlaylistItems,
  isTestDjSourcePlaylist,
  rotateTestDjPlayedItemToBottom,
};
