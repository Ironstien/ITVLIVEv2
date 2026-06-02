const { Playlist, PlaylistItem, User } = require('../models');
const { parseYoutubeId, fetchYoutubeMeta } = require('./youtube');

const EXPORT_URL = (youtubeId) => `https://www.youtube.com/watch?v=${youtubeId}`;

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 */
async function assertPlaylistOwner(userId, playlistId) {
  const playlist = await Playlist.findOne({ _id: playlistId, userId });
  if (!playlist) {
    const err = new Error('Playlist not found');
    err.status = 404;
    throw err;
  }
  return playlist;
}

function serializePlaylist(doc) {
  const p = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(p._id),
    name: p.name,
    isActive: !!p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function serializeItem(doc) {
  const i = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(i._id),
    playlistId: String(i.playlistId),
    title: i.title,
    youtubeId: i.youtubeId,
    order: i.order,
    addedAt: i.addedAt,
  };
}

/**
 * Set one playlist active for a user; clears isActive on all other playlists.
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 */
async function setActivePlaylist(userId, playlistId) {
  const playlist = await assertPlaylistOwner(userId, playlistId);

  await Playlist.updateMany({ userId, _id: { $ne: playlistId } }, { $set: { isActive: false } });
  playlist.isActive = true;
  await playlist.save();

  await User.findByIdAndUpdate(userId, { activePlaylistId: playlistId });

  return serializePlaylist(playlist);
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 */
async function getActivePlaylist(userId) {
  const playlist = await Playlist.findOne({ userId, isActive: true });
  return playlist ? serializePlaylist(playlist) : null;
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 */
async function listPlaylists(userId) {
  const docs = await Playlist.find({ userId }).sort({ isActive: -1, name: 1 });
  return docs.map(serializePlaylist);
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {string} name
 */
async function createPlaylist(userId, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    const err = new Error('Playlist name is required');
    err.status = 400;
    throw err;
  }
  if (trimmed.length > 120) {
    const err = new Error('Playlist name is too long');
    err.status = 400;
    throw err;
  }

  const count = await Playlist.countDocuments({ userId });
  const isFirst = count === 0;

  const playlist = await Playlist.create({
    userId,
    name: trimmed,
    isActive: isFirst,
  });

  if (isFirst) {
    await User.findByIdAndUpdate(userId, { activePlaylistId: playlist._id });
  }

  return serializePlaylist(playlist);
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 */
async function getPlaylistWithItems(userId, playlistId) {
  const playlist = await assertPlaylistOwner(userId, playlistId);
  const items = await PlaylistItem.find({ playlistId }).sort({ order: 1 });
  return {
    playlist: serializePlaylist(playlist),
    items: items.map(serializeItem),
  };
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 * @param {{ name?: string }} updates
 */
async function updatePlaylist(userId, playlistId, { name }) {
  const playlist = await assertPlaylistOwner(userId, playlistId);
  if (name !== undefined) {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      const err = new Error('Playlist name is required');
      err.status = 400;
      throw err;
    }
    playlist.name = trimmed.slice(0, 120);
  }
  await playlist.save();
  return serializePlaylist(playlist);
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 */
async function deletePlaylist(userId, playlistId) {
  const playlist = await assertPlaylistOwner(userId, playlistId);
  const wasActive = playlist.isActive;

  await PlaylistItem.deleteMany({ playlistId });
  await playlist.deleteOne();

  if (wasActive) {
    const next = await Playlist.findOne({ userId }).sort({ updatedAt: -1 });
    if (next) {
      await setActivePlaylist(userId, next._id);
    } else {
      await User.findByIdAndUpdate(userId, { activePlaylistId: null });
    }
  }

  return { ok: true };
}

/**
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 */
async function nextItemOrder(playlistId) {
  const last = await PlaylistItem.findOne({ playlistId }).sort({ order: -1 }).select('order');
  return last ? last.order + 1 : 0;
}

/**
 * Parse one import line — accepts either:
 *   "Title https://youtube.com/..."
 *   "dQw4w9WgXcQ" (bare 11-char video ID)
 * @param {string} line
 * @returns {{ title: string|null, youtubeId: string }|{ error: string }|null}
 */
function parseImportLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const urlMatch = trimmed.match(/(https?:\/\/\S+)/i);
  if (urlMatch) {
    const url = urlMatch[1].replace(/[),;]+$/, '');
    const title = trimmed.slice(0, urlMatch.index).trim();
    const youtubeId = parseYoutubeId(url);
    if (!youtubeId) {
      return { error: `Invalid YouTube URL: ${url}` };
    }
    return {
      title: title || null,
      youtubeId,
    };
  }

  const youtubeId = parseYoutubeId(trimmed);
  if (youtubeId) {
    return { title: null, youtubeId };
  }

  return { error: `Unrecognized line: ${trimmed.slice(0, 60)}` };
}

async function resolveTrackTitle(youtubeId, title) {
  const trimmed = String(title || '').trim();
  if (trimmed) return trimmed.slice(0, 300);
  try {
    const meta = await fetchYoutubeMeta(youtubeId);
    return (meta.title || 'Untitled').slice(0, 300);
  } catch {
    return 'Untitled';
  }
}

/**
 * @param {string} text
 */
function parseImportText(text) {
  const lines = String(text || '').split(/\r?\n/);
  const tracks = [];
  const errors = [];

  lines.forEach((line, index) => {
    const parsed = parseImportLine(line);
    if (!parsed) return;
    if (parsed.error) {
      errors.push({ line: index + 1, message: parsed.error });
      return;
    }
    tracks.push(parsed);
  });

  return { tracks, errors };
}

/**
 * @param {Array<{ title: string, youtubeId: string }>} items
 */
function exportPlaylistText(items) {
  return items
    .map((item) => `${item.title} ${EXPORT_URL(item.youtubeId)}`)
    .join('\n');
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 * @param {string} url
 * @param {string} [titleOverride]
 */
async function addItem(userId, playlistId, url, titleOverride) {
  await assertPlaylistOwner(userId, playlistId);

  const youtubeId = parseYoutubeId(url);
  if (!youtubeId) {
    const err = new Error('Invalid YouTube URL');
    err.status = 400;
    throw err;
  }

  let title = String(titleOverride || '').trim();
  if (!title) {
    try {
      const meta = await fetchYoutubeMeta(youtubeId);
      title = meta.title || 'Untitled';
    } catch {
      title = 'Untitled';
    }
  }

  const order = await nextItemOrder(playlistId);
  const item = await PlaylistItem.create({
    playlistId,
    title: title.slice(0, 300),
    youtubeId,
    order,
  });

  return serializeItem(item);
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 * @param {import('mongoose').Types.ObjectId|string} itemId
 * @param {{ title?: string }} updates
 */
async function updateItem(userId, playlistId, itemId, { title }) {
  await assertPlaylistOwner(userId, playlistId);
  const item = await PlaylistItem.findOne({ _id: itemId, playlistId });
  if (!item) {
    const err = new Error('Track not found');
    err.status = 404;
    throw err;
  }
  if (title !== undefined) {
    const trimmed = String(title || '').trim();
    if (!trimmed) {
      const err = new Error('Title is required');
      err.status = 400;
      throw err;
    }
    item.title = trimmed.slice(0, 300);
  }
  await item.save();
  return serializeItem(item);
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 * @param {import('mongoose').Types.ObjectId|string} itemId
 */
async function deleteItem(userId, playlistId, itemId) {
  await assertPlaylistOwner(userId, playlistId);
  const item = await PlaylistItem.findOneAndDelete({ _id: itemId, playlistId });
  if (!item) {
    const err = new Error('Track not found');
    err.status = 404;
    throw err;
  }
  return { ok: true };
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 * @param {string[]} itemIds
 */
async function reorderItems(userId, playlistId, itemIds) {
  await assertPlaylistOwner(userId, playlistId);

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    const err = new Error('order array is required');
    err.status = 400;
    throw err;
  }

  const existing = await PlaylistItem.find({ playlistId }).sort({ order: 1 });
  const existingIds = existing.map((i) => String(i._id));
  const requested = itemIds.map(String);

  if (
    existingIds.length !== requested.length ||
    existingIds.some((id) => !requested.includes(id))
  ) {
    const err = new Error('order must include every track exactly once');
    err.status = 400;
    throw err;
  }

  await Promise.all(
    requested.map((id, index) =>
      PlaylistItem.updateOne({ _id: id, playlistId }, { $set: { order: index } })
    )
  );

  const items = await PlaylistItem.find({ playlistId }).sort({ order: 1 });
  return items.map(serializeItem);
}

/**
 * Move one track to the bottom of a playlist (after DJ play/skip rotation).
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 * @param {import('mongoose').Types.ObjectId|string} itemId
 */
async function movePlayedItemToBottom(userId, playlistId, itemId) {
  await assertPlaylistOwner(userId, playlistId);
  const items = await PlaylistItem.find({ playlistId }).sort({ order: 1 });
  const ids = items.map((i) => String(i._id));
  const target = String(itemId);
  const idx = ids.indexOf(target);
  if (idx === -1) {
    const err = new Error('Track not found');
    err.status = 404;
    throw err;
  }
  if (idx === ids.length - 1) {
    return items.map(serializeItem);
  }
  ids.splice(idx, 1);
  ids.push(target);
  return reorderItems(userId, playlistId, ids);
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 * @param {string} text
 * @param {'append'|'replace'} mode
 */
async function importPlaylist(userId, playlistId, text, mode = 'append') {
  await assertPlaylistOwner(userId, playlistId);
  const { tracks, errors } = parseImportText(text);

  if (tracks.length === 0 && errors.length > 0) {
    const err = new Error(errors[0].message);
    err.status = 400;
    err.details = errors;
    throw err;
  }

  if (mode === 'replace') {
    await PlaylistItem.deleteMany({ playlistId });
  }

  let order = mode === 'replace' ? 0 : await nextItemOrder(playlistId);
  const created = [];

  for (const track of tracks) {
    const title = await resolveTrackTitle(track.youtubeId, track.title);
    const item = await PlaylistItem.create({
      playlistId,
      title,
      youtubeId: track.youtubeId,
      order: order++,
    });
    created.push(serializeItem(item));
  }

  return { imported: created.length, skipped: errors.length, errors, items: created };
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {import('mongoose').Types.ObjectId|string} playlistId
 */
async function exportPlaylist(userId, playlistId) {
  const { playlist, items } = await getPlaylistWithItems(userId, playlistId);
  const text = exportPlaylistText(items);
  return { playlist, text };
}

module.exports = {
  setActivePlaylist,
  getActivePlaylist,
  listPlaylists,
  createPlaylist,
  getPlaylistWithItems,
  updatePlaylist,
  deletePlaylist,
  parseImportLine,
  parseImportText,
  exportPlaylistText,
  addItem,
  updateItem,
  deleteItem,
  reorderItems,
  movePlayedItemToBottom,
  importPlaylist,
  exportPlaylist,
  EXPORT_URL,
};
