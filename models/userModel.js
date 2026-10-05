const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'hr', 'hr_manager', 'manager', 'employee'],
      default: 'employee',
      required: true,
      index: true
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    lastLoginAt: {
      type: Date,
      default: null
    },
    emailVerificationTokenHash: {
      type: String,
      select: false
    },
    emailVerificationExpires: {
      type: Date,
      select: false
    },
    passwordResetTokenHash: {
      type: String,
      select: false
    },
    passwordResetExpires: {
      type: Date,
      select: false
    },
    tokenVersion: {
      type: Number,
      default: 0
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    twoFactorSecretEncrypted: {
      type: String,
      select: false
    },
    twoFactorPendingSecretEncrypted: {
      type: String,
      select: false
    },
    twoFactorPendingExpires: {
      type: Date,
      select: false
    },
    twoFactorRecoveryCodeHashes: {
      type: [String],
      default: [],
      select: false
    }
  },
  {
    timestamps: true,
    collection: 'users'
  }
);

module.exports = mongoose.model('User', userSchema);
