const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { appendBugReport } = require('../services/bugReports');

const router = express.Router();

router.post('/', optionalAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await appendBugReport({
      description: body.description,
      steps: body.steps,
      pageUrl: body.pageUrl,
      userAgent: body.userAgent || req.headers['user-agent'],
      userId: req.user?.id || null,
      username: req.user?.username || body.guestName || null,
      email: req.user?.email || null,
    });

    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json({ ok: true, id: result.id });
  } catch (err) {
    console.error('[bug-reports] submit failed:', err.message);
    res.status(500).json({ error: 'Failed to save bug report' });
  }
});

module.exports = router;
