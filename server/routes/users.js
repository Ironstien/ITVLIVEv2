const express = require('express');
const mongoose = require('mongoose');
const { getPublicUserProfile } = require('../services/userProfile');
const { isDbConnected } = require('../config/db');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

function isValidObjectId(id) {
  if (!id) return false;
  const str = String(id);
  return mongoose.Types.ObjectId.isValid(str) && String(new mongoose.Types.ObjectId(str)) === str;
}

router.get('/:userId/profile', optionalAuth, async (req, res) => {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }

  const { userId } = req.params;
  if (!isValidObjectId(userId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  try {
    const viewerId = req.user?.id || req.user?._id || null;
    const result = await getPublicUserProfile(userId, viewerId);
    if (result.error) {
      res.status(result.error === 'User not found' ? 404 : 503).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('[users] profile failed:', err.message);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

module.exports = router;
