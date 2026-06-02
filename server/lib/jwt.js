const jwt = require('jsonwebtoken');

const DEFAULT_EXPIRY = '7d';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim()) {
    throw new Error('JWT_SECRET is not configured');
  }
  return String(secret).trim();
}

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, getSecret(), { expiresIn: DEFAULT_EXPIRY });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

function isJwtConfigured() {
  return Boolean(process.env.JWT_SECRET && String(process.env.JWT_SECRET).trim());
}

module.exports = { signToken, verifyToken, isJwtConfigured, DEFAULT_EXPIRY };
