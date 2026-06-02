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

async function ensureFounderAdmin(userDoc) {
  if (!userDoc || !matchesFounderAdmin(userDoc)) return userDoc;
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
  matchesFounderAdmin,
  ensureFounderAdmin,
  ensureFounderAdminsInDb,
};
