const mongoose = require('mongoose');

const authSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    refreshTokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false
    },
    deviceName: {
      type: String,
      trim: true,
      maxlength: 180,
      default: 'Unknown device'
    },
    ipAddress: {
      type: String,
      maxlength: 64,
      default: ''
    },
    lastUsedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true
    },
    revokedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'auth_sessions'
  }
);

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

module.exports = mongoose.model('AuthSession', authSessionSchema);