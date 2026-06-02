const express = require('express');
const { isDbConnected } = require('../config/db');
const { listPlayedSongs } = require('../services/songs');

const router = express.Router();

router.get('/', async (_req, res) => {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }
  try {
    const result = await listPlayedSongs();
    if (result.error) {
      res.status(503).json({ error: result.error });
      return;
    }
    res.json({ ok: true, songs: result.songs });
  } catch (err) {
    console.error('[songs] list failed:', err.message);
    res.status(500).json({ error: 'Failed to load song data' });
  }
});

module.exports = router;
