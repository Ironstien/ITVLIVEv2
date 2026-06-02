const mongoose = require('mongoose');

const playlistItemSchema = new mongoose.Schema(
  {
    playlistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Playlist',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    youtubeId: { type: String, required: true, trim: true },
    order: { type: Number, required: true, min: 0 },
    addedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

playlistItemSchema.index({ playlistId: 1, order: 1 });

module.exports = mongoose.model('PlaylistItem', playlistItemSchema);
