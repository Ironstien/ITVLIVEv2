#!/usr/bin/env node
/**
 * Wipe all users and user-owned data, then create the founder admin account.
 *
 * Production (e.g. Render Shell) — set env vars in the dashboard, then run:
 *   node scripts/reset-all-users.js
 *
 * Required env:
 *   MONGODB_URI
 *   CONFIRM_RESET_ALL_USERS=DELETE_ALL_USERS
 *   ITV_FOUNDER_PASSWORD=<password for ptvanw@gmail.com, min 8 chars>
 *
 * Optional:
 *   ITV_FOUNDER_EMAIL (default: ptvanw@gmail.com from founder config)
 *   ITV_FOUNDER_USERNAME (default: Ironstien)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { connectDB, isDbConnected } = require('../server/config/db');
const { FOUNDER_ADMINS } = require('../server/config/founderAdmins');
const { MIN_PASSWORD_LEN } = require('../server/services/auth');
const {
  User,
  Playlist,
  PlaylistItem,
  Vote,
  XpTransaction,
  StaffAuditLog,
  PlaySession,
} = require('../server/models');

const CONFIRM_VALUE = 'DELETE_ALL_USERS';

async function deleteAllUserData() {
  const results = {};

  results.votes = (await Vote.deleteMany({})).deletedCount;
  results.playlistItems = (await PlaylistItem.deleteMany({})).deletedCount;
  results.playlists = (await Playlist.deleteMany({})).deletedCount;
  results.xpTransactions = (await XpTransaction.deleteMany({})).deletedCount;
  results.staffAuditLogs = (await StaffAuditLog.deleteMany({})).deletedCount;
  results.playSessions = (await PlaySession.deleteMany({})).deletedCount;
  results.users = (await User.deleteMany({})).deletedCount;

  return results;
}

async function createFounderAdmin() {
  const founder = FOUNDER_ADMINS[0];
  const email = String(process.env.ITV_FOUNDER_EMAIL || founder.email)
    .trim()
    .toLowerCase();
  const username = String(process.env.ITV_FOUNDER_USERNAME || founder.username).trim();
  const password = String(process.env.ITV_FOUNDER_PASSWORD || '');

  if (!email.includes('@')) {
    throw new Error('Invalid founder email');
  }
  if (password.length < MIN_PASSWORD_LEN) {
    throw new Error(`ITV_FOUNDER_PASSWORD must be at least ${MIN_PASSWORD_LEN} characters`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email,
    username,
    passwordHash,
    level: 1,
    xp: 0,
    staffRole: 'admin',
    badges: ['account_created'],
  });

  return user;
}

async function main() {
  if (process.env.CONFIRM_RESET_ALL_USERS !== CONFIRM_VALUE) {
    console.error(
      `Refusing to run: set CONFIRM_RESET_ALL_USERS=${CONFIRM_VALUE} in the environment.`
    );
    process.exit(1);
  }

  if (!process.env.MONGODB_URI?.trim()) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  if (!process.env.ITV_FOUNDER_PASSWORD?.trim()) {
    console.error('ITV_FOUNDER_PASSWORD is required (min 8 characters).');
    process.exit(1);
  }

  await connectDB();
  if (!isDbConnected()) {
    console.error('Could not connect to MongoDB.');
    process.exit(1);
  }

  console.log('[reset] Deleting all users and user-linked records…');
  const deleted = await deleteAllUserData();
  console.log('[reset] Deleted:', deleted);

  const user = await createFounderAdmin();
  console.log(`[reset] Created founder admin: ${user.email} (${user.username}), staffRole=admin`);
  console.log('[reset] Done. Log in on the site with that email and ITV_FOUNDER_PASSWORD.');
  console.log('[reset] Remove CONFIRM_RESET_ALL_USERS and ITV_FOUNDER_PASSWORD from env after use.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[reset] Failed:', err.message || err);
  process.exit(1);
});
