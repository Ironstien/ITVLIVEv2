const { verifyToken, isJwtConfigured } = require('../lib/jwt');
const { findUserById } = require('../services/auth');
const { isDbConnected } = require('../config/db');
const { isModOrAbove, isAdmin } = require('../config/permissions');

function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

async function requireAuth(req, res, next) {
  if (!isJwtConfigured()) {
    res.status(503).json({ error: 'Auth not configured (JWT_SECRET missing)' });
    return;
  }
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }

  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = verifyToken(token);
    const user = await findUserById(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    if (user.isBanned) {
      res.status(403).json({ error: 'Account is deactivated' });
      return;
    }
    req.user = user;
    next();
  } catch (_err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function requireStaff(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!isModOrAbove(req.user)) {
    res.status(403).json({ error: 'Staff access required' });
    return;
  }
  next();
}

async function requireAdmin(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!isAdmin(req.user)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

async function optionalAuth(req, _res, next) {
  req.user = null;
  if (!isJwtConfigured() || !isDbConnected()) {
    next();
    return;
  }

  const token = extractBearerToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyToken(token);
    const user = await findUserById(payload.sub);
    if (user) req.user = user;
  } catch (_err) {
    /* ignore invalid token for public routes */
  }
  next();
}

module.exports = { requireAuth, requireStaff, requireAdmin, optionalAuth, extractBearerToken };
