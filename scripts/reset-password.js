#!/usr/bin/env node
/**
 * Reset a user's password (local/dev ops).
 * Usage: node scripts/reset-password.js <email> <new-password>
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { connectDB, isDbConnected } = require('../server/config/db');
const { User } = require('../server/models');
const { MIN_PASSWORD_LEN } = require('../server/services/auth');

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const password = String(process.argv[3] || '');

  if (!email || !email.includes('@')) {
    console.error('Usage: node scripts/reset-password.js <email> <new-password>');
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LEN) {
    console.error(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
    process.exit(1);
  }

  await connectDB();
  if (!isDbConnected()) {
    console.error('Database not connected. Set MONGODB_URI in .env');
    process.exit(1);
  }

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  await user.save();
  console.log(`Password updated for ${user.email} (${user.username}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
