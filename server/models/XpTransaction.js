const mongoose = require('mongoose');

const xpTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

xpTransactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('XpTransaction', xpTransactionSchema);
