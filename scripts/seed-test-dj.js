#!/usr/bin/env node
/**
 * Ensure Bob McCluckn exists as a system account (no login).
 * Run: node scripts/seed-test-dj.js
 */
require('dotenv').config();

const { connectDB } = require('../server/config/db');
const { ensureTestDjAccountInDb } = require('../server/services/testDjAccount');
const { TEST_DJ_DISPLAY_NAME, TEST_DJ_EMAIL } = require('../server/config/testDj');

async function main() {
  await connectDB();
  const user = await ensureTestDjAccountInDb();
  if (!user) {
    console.error('MONGODB_URI is required to seed the test DJ account.');
    process.exit(1);
  }
  console.log(`[seed-test-dj] ${TEST_DJ_DISPLAY_NAME} ready (${TEST_DJ_EMAIL}, id=${user._id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-test-dj] failed:', err.message);
  process.exit(1);
});
