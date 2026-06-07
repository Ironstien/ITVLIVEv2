/** Virtual test DJ — Bob McCluckn, system-controlled via admin toggle. */

const TEST_DJ_SOCKET_ID = 'test-dj-bob-mccluckn';
const TEST_DJ_EMAIL = 'bob-mccluckn@system.itvlive.internal';
const TEST_DJ_USERNAME = 'Bob_McCluckn';
const TEST_DJ_DISPLAY_NAME = 'Bob McCluckn';
const TEST_DJ_AVATAR_URL = '/img/favicon.png';

/** Fallback when MongoDB is unavailable (local dev without MONGODB_URI). */
function getEnvTestDjDefault() {
  const raw = String(process.env.ENABLE_TEST_DJ ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return process.env.NODE_ENV !== 'production';
}

module.exports = {
  TEST_DJ_SOCKET_ID,
  TEST_DJ_EMAIL,
  TEST_DJ_USERNAME,
  TEST_DJ_DISPLAY_NAME,
  TEST_DJ_AVATAR_URL,
  getEnvTestDjDefault,
};
