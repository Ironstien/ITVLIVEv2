const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { can } = require('../config/permissions');
const { room } = require('../sockets');
const {
  listPlaylists,
  createPlaylist,
  getPlaylistWithItems,
  updatePlaylist,
  deletePlaylist,
  setActivePlaylist,
  addItem,
  updateItem,
  deleteItem,
  reorderItems,
  shufflePlaylist,
  importPlaylist,
  exportPlaylist,
} = require('../services/playlist');
const { isTestDjSourcePlaylist } = require('../services/testDjPlaylist');

const router = express.Router();

async function maybeSyncBobFromPlaylistEdit(req, playlistId) {
  if (!(await isTestDjSourcePlaylist(req.user.id, playlistId))) return;
  const result = await room.syncTestDjQueueFromSource();
  const io = req.app.get('io');
  if (io && result.updated) {
    io.emit('room:state', room.getRoomState());
  }
}

router.use(requireAuth);

function denyPlaylist(req, res) {
  if (!can(req.user, 'managePlaylists')) {
    res.status(403).json({ error: 'Playlist access requires an account' });
    return true;
  }
  return false;
}

function handleError(res, err) {
  const status = err.status || 500;
  const body = { error: err.message || 'Request failed' };
  if (err.details) body.details = err.details;
  res.status(status).json(body);
}

router.get('/', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    const playlists = await listPlaylists(req.user.id);
    res.json({ ok: true, playlists });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    const playlist = await createPlaylist(req.user.id, req.body?.name);
    res.status(201).json({ ok: true, playlist });
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    const data = await getPlaylistWithItems(req.user.id, req.params.id);
    res.json({ ok: true, ...data });
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/:id', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    const playlist = await updatePlaylist(req.user.id, req.params.id, {
      name: req.body?.name,
    });
    res.json({ ok: true, playlist });
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    await deletePlaylist(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/:id/activate', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    const playlist = await setActivePlaylist(req.user.id, req.params.id);
    const queueSync = await room.syncQueueEntryActivePlaylist(req.user.id);
    const io = req.app.get('io');
    if (io && queueSync.updated) {
      io.emit('room:state', room.getRoomState());
    }
    res.json({ ok: true, playlist, queueSynced: Boolean(queueSync.updated) });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/:id/items', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    const item = await addItem(req.user.id, req.params.id, req.body?.url, req.body?.title);
    await maybeSyncBobFromPlaylistEdit(req, req.params.id);
    res.status(201).json({ ok: true, item });
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/:id/items/:itemId', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    const item = await updateItem(req.user.id, req.params.id, req.params.itemId, {
      title: req.body?.title,
    });
    await maybeSyncBobFromPlaylistEdit(req, req.params.id);
    res.json({ ok: true, item });
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/:id/items/:itemId', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    await deleteItem(req.user.id, req.params.id, req.params.itemId);
    await maybeSyncBobFromPlaylistEdit(req, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

router.put('/:id/items/reorder', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    const items = await reorderItems(req.user.id, req.params.id, req.body?.order);
    await maybeSyncBobFromPlaylistEdit(req, req.params.id);
    res.json({ ok: true, items });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/:id/shuffle', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    const items = await shufflePlaylist(req.user.id, req.params.id);
    const data = await getPlaylistWithItems(req.user.id, req.params.id);
    await maybeSyncBobFromPlaylistEdit(req, req.params.id);
    res.json({ ok: true, items, playlist: data.playlist });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/:id/import', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    const mode = req.body?.mode === 'replace' ? 'replace' : 'append';
    const result = await importPlaylist(req.user.id, req.params.id, req.body?.text, mode);
    const data = await getPlaylistWithItems(req.user.id, req.params.id);
    await maybeSyncBobFromPlaylistEdit(req, req.params.id);
    res.json({ ok: true, ...result, playlist: data.playlist, items: data.items });
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/:id/export', async (req, res) => {
  if (denyPlaylist(req, res)) return;
  try {
    const { playlist, text } = await exportPlaylist(req.user.id, req.params.id);
    const safeName = playlist.name.replace(/[^\w\-]+/g, '_').slice(0, 60) || 'playlist';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.txt"`);
    res.send(text);
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
