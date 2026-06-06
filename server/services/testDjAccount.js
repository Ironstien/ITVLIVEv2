const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User } = require('../models');
const { isDbConnected } = require('../config/db');
const { evaluateAndGrantBadges } = require('./badges');
const {
  TEST_DJ_EMAIL,
  TEST_DJ_USERNAME,
  TEST_DJ_AVATAR_URL,
} = require('../config/testDj');

/** @type {string|null} Mongo ObjectId string for Bob McCluckn */
let cachedUserId = null;

function getTestDjUserId() {
  return cachedUserId;
}

function isTestDjUserId(userId) {
  if (!userId || !cachedUserId) return false;
  return String(userId) === String(cachedUserId);
}

function isReservedTestDjEmail(email) {
  return String(email || '').trim().toLowerCase() === TEST_DJ_EMAIL;
}

function isReservedTestDjUsername(username) {
  return String(username || '').trim() === TEST_DJ_USERNAME;
}

function isSystemAccountUser(doc) {
  if (!doc) return false;
  if (doc.isSystemAccount) return true;
  return isReservedTestDjEmail(doc.email);
}

async function ensureTestDjAccountInDb() {
  if (!isDbConnected()) return null;

  let user = await User.findOne({ email: TEST_DJ_EMAIL });
  if (!user) {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'), 10);
    user = await User.create({
      email: TEST_DJ_EMAIL,
      username: TEST_DJ_USERNAME,
      passwordHash,
      avatarUrl: TEST_DJ_AVATAR_URL,
      isSystemAccount: true,
      level: 1,
      xp: 0,
    });
    await evaluateAndGrantBadges(user);
    console.log('[testDj] created system account', TEST_DJ_USERNAME);
  } else if (!user.isSystemAccount) {
    user.isSystemAccount = true;
    await user.save();
  }

  cachedUserId = String(user._id);
  return user;
}

async function loadTestDjProfile() {
  if (!cachedUserId || !isDbConnected()) return null;
  return User.findById(cachedUserId).lean();
}

function clearTestDjUserIdCache() {
  cachedUserId = null;
}

module.exports = {
  getTestDjUserId,
  isTestDjUserId,
  isReservedTestDjEmail,
  isReservedTestDjUsername,
  isSystemAccountUser,
  ensureTestDjAccountInDb,
  loadTestDjProfile,
  clearTestDjUserIdCache,
};
