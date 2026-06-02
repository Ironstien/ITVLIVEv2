const express = require('express');
const { getPublicBadgeCatalog } = require('../config/badges');

const router = express.Router();

router.get('/catalog', (_req, res) => {
  res.json({ ok: true, badges: getPublicBadgeCatalog() });
});

module.exports = router;
