const mongoose = require('mongoose');

const STAFF_ACTIONS = [
  'clearChat',
  'skipAnySong',
  'muteUser',
  'unmuteUser',
  'removeFromQueue',
  'deleteChatMessage',
  'lockChat',
  'unlockChat',
  'assignStaffRole',
  'setUserXp',
  'managePlatform',
  'resetUserStats',
  'resetUserBadges',
  'resetAllUserBadges',
  'forceDisconnect',
  'blockVideo',
  'unblockVideo',
  'accountBan',
  'unbanAccount',
  'founderResetSongs',
  'founderResetVotes',
  'founderResetPlaySessions',
  'founderResetXpTransactions',
  'founderResetUserProgress',
  'founderNuclearWipeRequested',
];

const staffAuditLogSchema = new mongoose.Schema(
  {
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorUsername: { type: String, required: true, trim: true },
    action: {
      type: String,
      required: true,
      enum: STAFF_ACTIONS,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    targetUsername: { type: String, default: null, trim: true },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

staffAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StaffAuditLog', staffAuditLogSchema);
module.exports.STAFF_ACTIONS = STAFF_ACTIONS;
