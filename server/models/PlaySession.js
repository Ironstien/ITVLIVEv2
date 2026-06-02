const mongoose = require('mongoose');

const playSessionSchema = new mongoose.Schema(
  {
    /** Room in-memory playSessionId (UUID) — links live playback to persisted session. */
    sessionKey: { type: String, trim: true, unique: true, sparse: true, index: true },
    youtubeId: { type: String, required: true, trim: true, index: true },
    songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', default: null },
    playedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    aggregates: {
      voteCount: { type: Number, default: 0 },
      totalScore: { type: Number, default: 0 },
      avgScore: { type: Number, default: 0 },
      highScore: { type: Number, default: 0 },
      lowScore: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

playSessionSchema.index({ startedAt: -1 });

module.exports = mongoose.model('PlaySession', playSessionSchema);
