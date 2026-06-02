const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { isJwtConfigured } = require('../lib/jwt');
const { isDbConnected } = require('../config/db');
const {
  registerUser,
  loginUser,
  updateProfile,
} = require('../services/auth');
const { getUserFullData } = require('../services/userData');

const router = express.Router();

function authUnavailable(_req, res) {
  if (!isJwtConfigured()) {
    res.status(503).json({ error: 'Auth not configured (set JWT_SECRET)' });
    return true;
  }
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Database not available (set MONGODB_URI)' });
    return true;
  }
  return false;
}

router.post('/register', async (req, res) => {
  if (authUnavailable(req, res)) return;
  try {
    const result = await registerUser(req.body || {});
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json({ ok: true, user: result.user, token: result.token });
  } catch (err) {
    console.error('[auth] register failed:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  if (authUnavailable(req, res)) return;
  try {
    const result = await loginUser(req.body || {});
    if (result.error) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.json({ ok: true, user: result.user, token: result.token });
  } catch (err) {
    console.error('[auth] login failed:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

router.get('/my-data', requireAuth, async (req, res) => {
  try {
    const result = await getUserFullData(req.user.id);
    if (result.error) {
      res.status(result.error === 'User not found' ? 404 : 503).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('[auth] my-data failed:', err.message);
    res.status(500).json({ error: 'Failed to load account data' });
  }
});

router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const result = await updateProfile(req.user.id, req.body || {});
    if (result.error) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json({ ok: true, user: result.user });
  } catch (err) {
    console.error('[auth] profile update failed:', err.message);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

module.exports = router;
