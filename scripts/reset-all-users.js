#!/usr/bin/env node
/**
 * Wipe all users and user-owned data, then create the founder admin account.
 *
 * Production (e.g. Render Shell) — set env vars in the dashboard, then run:
 *   node scripts/reset-all-users.js --confirm DELETE_ALL_USERS --password "YourPassword"
 *
 * Required:
 *   MONGODB_URI (in .env or env)
 *   Confirm: CONFIRM_RESET_ALL_USERS=DELETE_ALL_USERS  OR  --confirm DELETE_ALL_USERS
 *   Password: ITV_FOUNDER_PASSWORD  OR  --password "min 8 chars"
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

function getConfirmFlag() {
  if (process.env.CONFIRM_RESET_ALL_USERS === CONFIRM_VALUE) return true;
  const args = process.argv.slice(2);
  const idx = args.indexOf('--confirm');
  if (idx !== -1 && args[idx + 1] === CONFIRM_VALUE) return true;
  return false;
}

function getFounderPassword() {
  const fromEnv = String(process.env.ITV_FOUNDER_PASSWORD || '').trim();
  if (fromEnv) return fromEnv;
  const args = process.argv.slice(2);
  const idx = args.indexOf('--password');
  if (idx !== -1 && args[idx + 1]) return String(args[idx + 1]);
  return '';
}

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
  const password = getFounderPassword();

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
  if (!getConfirmFlag()) {
    console.error(`Refusing to run. Confirm one of:`);
    console.error(`  PowerShell: $env:CONFIRM_RESET_ALL_USERS="${CONFIRM_VALUE}"`);
    console.error(`  .env file:  CONFIRM_RESET_ALL_USERS=${CONFIRM_VALUE}`);
    console.error(`  CLI flag:   node scripts/reset-all-users.js --confirm ${CONFIRM_VALUE}`);
    process.exit(1);
  }

  if (!process.env.MONGODB_URI?.trim()) {
    console.error('MONGODB_URI is not set (add it to .env or Render env).');
    process.exit(1);
  }

  if (!getFounderPassword()) {
    console.error('ITV_FOUNDER_PASSWORD is required (min 8 characters).');
    console.error('  Set in .env, or: --password "YourNewPassword"');
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
