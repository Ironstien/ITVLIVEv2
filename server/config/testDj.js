/** Virtual test DJ — Bob McCluckn, system-controlled via admin toggle. */

const fs = require('fs');
const path = require('path');
const { parseImportText } = require('../services/playlist');

const TEST_DJ_SOCKET_ID = 'test-dj-bob-mccluckn';
const TEST_DJ_EMAIL = 'bob-mccluckn@system.itvlive.internal';
const TEST_DJ_USERNAME = 'Bob_McCluckn';
const TEST_DJ_DISPLAY_NAME = 'Bob McCluckn';
const TEST_DJ_AVATAR_URL = '/img/favicon.png';
const TEST_DJ_PLAYLIST_ID = 'test-dj-playlist';
const TEST_DJ_PLAYLIST_PATH = path.join(__dirname, 'bob-test-dj-playlist.txt');

function loadTestDjPlaylist() {
  const raw = fs.readFileSync(TEST_DJ_PLAYLIST_PATH, 'utf8');
  const { tracks, errors } = parseImportText(raw);
  if (errors.length) {
    console.warn('[testDj] playlist parse warnings:', errors);
  }
  if (!tracks.length) {
    throw new Error(`[testDj] no valid tracks in ${TEST_DJ_PLAYLIST_PATH}`);
  }
  return tracks.map((track) => ({
    videoId: track.youtubeId,
    title: track.title || 'Untitled',
  }));
}

/** Tracks from bob-test-dj-playlist.txt (Title + YouTube URL per line). */
const TEST_DJ_PLAYLIST = loadTestDjPlaylist();

/** Fallback when MongoDB is unavailable (local dev without MONGODB_URI). */
function getEnvTestDjDefault() {
  const raw = String(process.env.ENABLE_TEST_DJ ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return process.env.NODE_ENV !== 'production';
}

function getTestDjPlaylistItems() {
  return TEST_DJ_PLAYLIST.map((track, index) => ({
    id: `test-dj-item-${index}`,
    youtubeId: track.videoId,
    title: track.title,
  }));
}

module.exports = {
  TEST_DJ_SOCKET_ID,
  TEST_DJ_EMAIL,
  TEST_DJ_USERNAME,
  TEST_DJ_DISPLAY_NAME,
  TEST_DJ_AVATAR_URL,
  TEST_DJ_PLAYLIST_ID,
  TEST_DJ_PLAYLIST_PATH,
  TEST_DJ_PLAYLIST,
  getEnvTestDjDefault,
  getTestDjPlaylistItems,
};
