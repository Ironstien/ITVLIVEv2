/** Virtual test DJ — keeps the stage playing when no real DJs are queued. */

const TEST_DJ_SOCKET_ID = 'test-dj-bob-mccluckn';
const TEST_DJ_USER_ID = 'test-user-bob-mccluckn';
const TEST_DJ_DISPLAY_NAME = 'Bob McCluckn';
const TEST_DJ_AVATAR_URL = '/img/favicon.png';

/** Finite-length tracks so the server track-end timer can advance reliably. */
const TEST_DJ_PLAYLIST = [
  { videoId: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up' },
  { videoId: '9bZkp7q19f0', title: 'PSY - GANGNAM STYLE' },
  { videoId: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito ft. Daddy Yankee' },
];

/** Fallback when MongoDB is unavailable (local dev without MONGODB_URI). */
function getEnvTestDjDefault() {
  const raw = String(process.env.ENABLE_TEST_DJ ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return process.env.NODE_ENV !== 'production';
}

function getTestDjTrack(index) {
  const i = ((index % TEST_DJ_PLAYLIST.length) + TEST_DJ_PLAYLIST.length) % TEST_DJ_PLAYLIST.length;
  return TEST_DJ_PLAYLIST[i];
}

module.exports = {
  TEST_DJ_SOCKET_ID,
  TEST_DJ_USER_ID,
  TEST_DJ_DISPLAY_NAME,
  TEST_DJ_AVATAR_URL,
  TEST_DJ_PLAYLIST,
  getEnvTestDjDefault,
  getTestDjTrack,
};
