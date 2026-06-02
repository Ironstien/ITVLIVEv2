const { isDbConnected } = require('./db');

/** Platform owners — always admin; role cannot be removed via the admin panel. */
const FOUNDER_ADMINS = [{ email: 'ptvanw@gmail.com', username: 'Ironstien' }];

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase();
}

function matchesFounderAdmin(userOrDoc) {
  if (!userOrDoc) return false;
  const email = normalizeEmail(userOrDoc.email);
  const username = normalizeUsername(userOrDoc.username);
  return FOUNDER_ADMINS.some(
    (founder) =>
      normalizeEmail(founder.email) === email ||
      normalizeUsername(founder.username) === username
  );
}

const VALID_STAFF_ROLES = ['mod', 'admin'];

function sanitizeStaffRole(userDoc) {
  if (!userDoc) return userDoc;
  const role = userDoc.staffRole;
  if (role == null || role === '') {
    userDoc.staffRole = null;
    return userDoc;
  }
  if (!VALID_STAFF_ROLES.includes(role)) {
    userDoc.staffRole = null;
  }
  return userDoc;
}

async function ensureFounderAdmin(userDoc) {
  if (!userDoc || !matchesFounderAdmin(userDoc)) return sanitizeStaffRole(userDoc);
  sanitizeStaffRole(userDoc);
  if (userDoc.staffRole === 'admin') return userDoc;
  userDoc.staffRole = 'admin';
  await userDoc.save();
  console.log(`[auth] ensured founder admin: ${userDoc.email} (${userDoc.username})`);
  return userDoc;
}

async function ensureFounderAdminsInDb() {
  if (!isDbConnected()) return { ok: true, promoted: 0 };

  const { User } = require('../models');
  let promoted = 0;

  for (const founder of FOUNDER_ADMINS) {
    const email = normalizeEmail(founder.email);
    const usernamePattern = new RegExp(
      `^${String(founder.username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'i'
    );

    const users = await User.find({
      $or: [{ email }, { username: usernamePattern }],
    });

    for (const user of users) {
      const before = user.staffRole;
      await ensureFounderAdmin(user);
      if (before !== 'admin' && user.staffRole === 'admin') promoted += 1;
    }
  }

  if (promoted > 0) {
    console.log(`[auth] promoted ${promoted} founder admin account(s) on startup`);
  }

  return { ok: true, promoted };
}

module.exports = {
  FOUNDER_ADMINS,
  VALID_STAFF_ROLES,
  matchesFounderAdmin,
  sanitizeStaffRole,
  ensureFounderAdmin,
  ensureFounderAdminsInDb,
};
