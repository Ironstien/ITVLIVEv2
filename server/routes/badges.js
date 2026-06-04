const express = require('express');
const { User } = require('../models');
const { getPublicBadgeCatalog, getBadgeDisplayName, getBadgeDefinition } = require('../config/badges');
const { evaluateAndGrantBadgesById } = require('../services/badges');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/catalog', (_req, res) => {
  res.json({ ok: true, badges: getPublicBadgeCatalog() });
});

router.get('/names', (_req, res) => {
  const catalog = getPublicBadgeCatalog();
  const byId = Object.fromEntries(catalog.map((b) => [b.id, b.name]));
  res.json({ ok: true, names: byId });
});

const devEnabled = () => process.env.BADGE_DEV_GRANT === '1' || process.env.NODE_ENV !== 'production';

if (devEnabled()) {
  router.post('/dev/grant', requireAuth, async (req, res) => {
    const badgeId = String(req.body?.badgeId || '').trim();
    if (!badgeId) {
      res.status(400).json({ error: 'badgeId required' });
      return;
    }
    if (!getBadgeDefinition(badgeId)) {
      res.status(400).json({ error: 'Unknown badge id' });
      return;
    }

    try {
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { badges: badgeId } });
      res.json({
        ok: true,
        badgeId,
        name: getBadgeDisplayName(badgeId),
        newBadges: [badgeId],
      });
    } catch (err) {
      console.error('[badges] dev grant failed:', err.message);
      res.status(500).json({ error: 'Grant failed' });
    }
  });

  router.post('/dev/evaluate', requireAuth, async (req, res) => {
    try {
      const newBadges = await evaluateAndGrantBadgesById(req.user.id, req.body?.ctx || {});
      res.json({ ok: true, newBadges });
    } catch (err) {
      console.error('[badges] dev evaluate failed:', err.message);
      res.status(500).json({ error: 'Evaluate failed' });
    }
  });
}

module.exports = router;
