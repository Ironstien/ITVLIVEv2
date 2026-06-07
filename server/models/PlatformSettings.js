const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: '', maxlength: 500 },
    alertsBannerMessage: { type: String, default: '', maxlength: 500 },
    /** Legacy combined flag — kept in sync with queue || chat */
    testDjEnabled: { type: Boolean, default: false },
    /** Bob McCluckn in the DJ rotation queue */
    testDjQueueEnabled: { type: Boolean, default: false },
    /** Bob McCluckn automated chat (idle lines, @mentions, badge compliments) */
    testDjChatEnabled: { type: Boolean, default: false },
    /** Multiplier applied to all earned XP (listen, vote, DJ). Minimum 1. */
    xpMultiplier: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
