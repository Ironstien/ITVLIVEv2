const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    isActive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

playlistSchema.index({ userId: 1, name: 1 });

module.exports = mongoose.model('Playlist', playlistSchema);
