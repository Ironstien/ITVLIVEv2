const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: '', maxlength: 500 },
    alertsBannerMessage: { type: String, default: '', maxlength: 500 },
    /** Virtual DJ (Bob McCluckn) — idle playback when the real queue is empty */
    testDjEnabled: { type: Boolean, default: false },
    /** Multiplier applied to all earned XP (listen, vote, DJ). Minimum 1. */
    xpMultiplier: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
