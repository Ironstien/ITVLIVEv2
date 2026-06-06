const mongoose = require('mongoose');
const { STAFF_ROLES } = require('../config/permissions');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    username: { type: String, required: true, trim: true },
    level: { type: Number, default: 1, min: 1, max: 60 },
    xp: { type: Number, default: 0, min: 0 },
    staffRole: {
      type: String,
      enum: { values: STAFF_ROLES, message: '{VALUE} is not a valid staff role' },
      default: null,
    },
    avatarUrl: { type: String, default: null },
    customSaying: { type: String, default: '', maxlength: 200 },
    badges: { type: [String], default: [] },
    activePlaylistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Playlist',
      default: null,
    },
    stats: {
      totalPlays: { type: Number, default: 0 },
      totalListens: { type: Number, default: 0 },
      totalVotesGiven: { type: Number, default: 0 },
      totalVotesReceived: { type: Number, default: 0 },
      avgScoreReceived: { type: Number, default: 0 },
      chatMessages: { type: Number, default: 0 },
      profilesViewed: { type: Number, default: 0 },
      highVotesGiven: { type: Number, default: 0 },
      lowVotesGiven: { type: Number, default: 0 },
      nightListens: { type: Number, default: 0 },
      listenerDayKey: { type: String, default: null },
      listenerDayCount: { type: Number, default: 0 },
      listenerStreakDays: { type: Number, default: 0 },
      djDayKey: { type: String, default: null },
      djDayCount: { type: Number, default: 0 },
      djStreakDays: { type: Number, default: 0 },
      voterStreakSessions: { type: Number, default: 0 },
      perfectMatchCount: { type: Number, default: 0 },
      firstVoterCount: { type: Number, default: 0 },
      b2bDjCount: { type: Number, default: 0 },
      hasHighScoreSet: { type: Boolean, default: false },
      hasPerfectRoom: { type: Boolean, default: false },
      hasCrowdPleaser: { type: Boolean, default: false },
      hasWarmUpAct: { type: Boolean, default: false },
      hasPeakTimeDj: { type: Boolean, default: false },
      hasCrateDigger: { type: Boolean, default: false },
      mentionedAxolotl: { type: Boolean, default: false },
      mentionedCoffee: { type: Boolean, default: false },
    },
    bannedAt: { type: Date, default: null },
    banReason: { type: String, default: '', maxlength: 300 },
    /** System-controlled accounts (e.g. Bob McCluckn) — no login or registration. */
    isSystemAccount: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
