const mongoose = require('mongoose');

const blockedVideoSchema = new mongoose.Schema(
  {
    youtubeId: { type: String, required: true, trim: true, uppercase: false },
    title: { type: String, default: null, trim: true, maxlength: 200 },
    reason: { type: String, default: '', trim: true, maxlength: 300 },
    blockedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

blockedVideoSchema.index({ youtubeId: 1 }, { unique: true });

module.exports = mongoose.model('BlockedVideo', blockedVideoSchema);
