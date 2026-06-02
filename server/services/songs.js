const { Song } = require('../models');
const { isDbConnected } = require('../config/db');

function formatSongStats(doc) {
  const stats = doc.stats || {};
  const voteCount = stats.voteCount ?? 0;
  return {
    youtubeId: doc.youtubeId,
    title: doc.title,
    playCount: stats.playCount ?? 0,
    voteCount,
    avgScore: voteCount > 0 ? stats.avgScore ?? 0 : null,
    highScore: voteCount > 0 ? stats.highScore ?? null : null,
    lowScore: voteCount > 0 ? stats.lowScore ?? null : null,
    lastUpdated: doc.updatedAt || doc.createdAt || null,
  };
}

async function listPlayedSongs() {
  if (!isDbConnected()) {
    return { error: 'Database not available' };
  }

  const docs = await Song.find({
    $or: [{ 'stats.playCount': { $gte: 1 } }, { 'stats.voteCount': { $gte: 1 } }],
  })
    .sort({ updatedAt: -1 })
    .lean();

  return {
    ok: true,
    songs: docs.map(formatSongStats),
  };
}

module.exports = {
  listPlayedSongs,
  formatSongStats,
};
