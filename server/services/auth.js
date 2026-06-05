const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { isDbConnected } = require('../config/db');
const { signToken } = require('../lib/jwt');
const { getLevelForXp, MAX_LEVEL } = require('../config/levels');
const { ensureFounderAdmin, sanitizeStaffRole } = require('../config/founderAdmins');
const { evaluateAndGrantBadges } = require('./badges');

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LEN = 8;
const USERNAME_RE = /^[a-zA-Z0-9_]{2,24}$/;

function toPublicUser(doc) {
  if (!doc) return null;
  const u = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(u._id),
    email: u.email,
    username: u.username,
    level: u.level ?? 1,
    xp: u.xp ?? 0,
    staffRole: u.staffRole ?? null,
    avatarUrl: u.avatarUrl ?? null,
    customSaying: u.customSaying ?? '',
    badges: Array.isArray(u.badges) ? u.badges : [],
    stats: u.stats || {},
    activePlaylistId: u.activePlaylistId ? String(u.activePlaylistId) : null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    isBanned: Boolean(u.bannedAt),
    banReason: u.banReason || '',
  };
}

function toSocketUser(publicUser) {
  if (!publicUser) return null;
  return {
    id: publicUser.id,
    username: publicUser.username,
    level: publicUser.level,
    xp: publicUser.xp ?? 0,
    staffRole: publicUser.staffRole,
    avatarUrl: publicUser.avatarUrl,
    customSaying: publicUser.customSaying,
    badges: publicUser.badges,
  };
}

function requireDb() {
  if (!isDbConnected()) {
    const err = new Error('Database not available');
    err.status = 503;
    throw err;
  }
}

/** Keep stored level in sync with total XP (fixes stale level after threshold tuning). */
async function reconcileUserLevel(doc) {
  if (!doc) return doc;
  const xp = doc.xp ?? 0;
  const level = Math.min(MAX_LEVEL, getLevelForXp(xp));
  const current = doc.level ?? 1;
  if (current !== level || current > MAX_LEVEL) {
    doc.level = level;
    await doc.save();
  }
  return doc;
}

async function prepareUserDocument(doc) {
  if (!doc) return null;
  sanitizeStaffRole(doc);
  await ensureFounderAdmin(doc);
  return reconcileUserLevel(doc);
}

async function findUserDocumentById(userId) {
  requireDb();
  if (!userId) return null;
  const user = await User.findById(userId);
  if (!user) return null;
  return prepareUserDocument(user);
}

function assertUserNotBanned(userDoc) {
  if (userDoc?.bannedAt) {
    return { error: 'Account is banned' };
  }
  return null;
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function getSeedAdminEmail() {
  const seed = process.env.SEED_ADMIN_EMAIL;
  if (!seed || !String(seed).trim()) return null;
  return normalizeEmail(seed);
}

/** Promote SEED_ADMIN_EMAIL to admin (bootstrap). Founder admins are always admin separately. */
async function maybePromoteSeedAdmin(userDoc) {
  if (!userDoc) return userDoc;
  sanitizeStaffRole(userDoc);
  const seedEmail = getSeedAdminEmail();
  if (seedEmail && normalizeEmail(userDoc.email) === seedEmail) {
    if (userDoc.staffRole !== 'admin') {
      userDoc.staffRole = 'admin';
      await userDoc.save();
      console.log(`[auth] promoted seed admin: ${userDoc.email}`);
    }
  }
  return ensureFounderAdmin(userDoc);
}

function validateRegisterInput({ email, username, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { error: 'Valid email is required' };
  }
  const name = String(username || '').trim();
  if (!USERNAME_RE.test(name)) {
    return {
      error: 'Username must be 2–24 characters (letters, numbers, underscore)',
    };
  }
  if (!password || String(password).length < MIN_PASSWORD_LEN) {
    return { error: `Password must be at least ${MIN_PASSWORD_LEN} characters` };
  }
  return { email: normalizedEmail, username: name, password: String(password) };
}

async function registerUser({ email, username, password }) {
  requireDb();
  const validated = validateRegisterInput({ email, username, password });
  if (validated.error) return validated;

  const passwordHash = await bcrypt.hash(validated.password, BCRYPT_ROUNDS);
  try {
    let user = await User.create({
      email: validated.email,
      username: validated.username,
      passwordHash,
      level: 1,
      xp: 0,
    });
    user = await maybePromoteSeedAdmin(user);
    await evaluateAndGrantBadges(user);
    user = await User.findById(user._id);
    const publicUser = toPublicUser(user);
    const token = signToken(publicUser.id);
    return { ok: true, user: publicUser, token };
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return { error: `${field === 'email' ? 'Email' : 'Username'} already in use` };
    }
    throw err;
  }
}

async function loginUser({ email, password }) {
  requireDb();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    return { error: 'Email and password are required' };
  }

  let user = await User.findOne({ email: normalizedEmail });
  if (!user) return { error: 'Invalid email or password' };
  if (user.bannedAt) {
    const reason = String(user.banReason || '');
    if (reason.includes('Self-deactivated')) {
      return { error: 'Account is deactivated. Contact an admin to restore access.' };
    }
    return { error: 'Account is banned' };
  }

  const match = await bcrypt.compare(String(password), user.passwordHash);
  if (!match) return { error: 'Invalid email or password' };

  sanitizeStaffRole(user);
  await maybePromoteSeedAdmin(user);
  await reconcileUserLevel(user);
  await evaluateAndGrantBadges(user);
  user = await User.findById(user._id);
  if (!user) return { error: 'Login failed' };
  const publicUser = toPublicUser(user);
  if (!publicUser?.id) return { error: 'Login failed' };
  const token = signToken(publicUser.id);
  return { ok: true, user: publicUser, token };
}

async function findUserById(userId) {
  const user = await findUserDocumentById(userId);
  return user ? toPublicUser(user) : null;
}

async function updateProfile(userId, { avatarUrl, customSaying }) {
  requireDb();
  const user = await User.findById(userId);
  if (!user) return { error: 'User not found' };

  if (avatarUrl !== undefined) {
    const url = String(avatarUrl || '').trim();
    user.avatarUrl = url.length ? url.slice(0, 500) : null;
  }
  if (customSaying !== undefined) {
    user.customSaying = String(customSaying || '').trim().slice(0, 200);
  }

  await user.save();
  return { ok: true, user: toPublicUser(user) };
}

async function changePassword(userId, { currentPassword, newPassword, confirmPassword }) {
  requireDb();
  const user = await User.findById(userId);
  if (!user) return { error: 'User not found' };
  if (user.bannedAt) return { error: 'Account is deactivated' };

  const current = String(currentPassword || '');
  const next = String(newPassword || '');
  const confirm = String(confirmPassword ?? newPassword ?? '');

  if (!current || !next) {
    return { error: 'Current and new password are required' };
  }
  if (next !== confirm) {
    return { error: 'New passwords do not match' };
  }
  if (next.length < MIN_PASSWORD_LEN) {
    return { error: `Password must be at least ${MIN_PASSWORD_LEN} characters` };
  }

  const match = await bcrypt.compare(current, user.passwordHash);
  if (!match) return { error: 'Current password is incorrect' };

  user.passwordHash = await bcrypt.hash(next, BCRYPT_ROUNDS);
  await user.save();
  return { ok: true };
}

async function deactivateAccount(userId) {
  requireDb();
  const user = await User.findById(userId);
  if (!user) return { error: 'User not found' };
  if (user.bannedAt) return { error: 'Account is already deactivated' };

  user.bannedAt = new Date();
  user.banReason = 'Self-deactivated by account owner';
  await user.save();
  return { ok: true };
}

module.exports = {
  toPublicUser,
  toSocketUser,
  registerUser,
  loginUser,
  findUserById,
  findUserDocumentById,
  assertUserNotBanned,
  reconcileUserLevel,
  updateProfile,
  changePassword,
  deactivateAccount,
  MIN_PASSWORD_LEN,
};
