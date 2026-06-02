const mongoose = require('mongoose');

const songSchema = new mongoose.Schema(
  {
    youtubeId: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    stats: {
      playCount: { type: Number, default: 0 },
      voteCount: { type: Number, default: 0 },
      totalScore: { type: Number, default: 0 },
      avgScore: { type: Number, default: 0 },
      highScore: { type: Number, default: 0 },
      lowScore: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Song', songSchema);
