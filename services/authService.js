const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const User = require('../models/userModel');
const AuthSession = require('../models/authSessionModel');
const AppError = require('../utils/appError');
const { verificationTokenMinutes, resetTokenMinutes } = require('../config/env');
const {
  createOneTimeToken,
  hashToken,
  createAccessCredentials,
  createRefreshToken,
  createTokenId,
  getRefreshExpiry,
  verifyRefreshToken
} = require('../utils/token');
const { encryptSecret, decryptSecret } = require('../utils/totp');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');

authenticator.options = { step: 30, window: 1 };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const validateCredentials = ({ name, email, password }, includeName = false) => {
  if (includeName && (!name || String(name).trim().length < 2)) {
    throw new AppError('Name must be at least 2 characters', 400);
  }

  if (!emailPattern.test(normalizeEmail(email))) {
    throw new AppError('A valid email is required', 400);
  }

  if (typeof password !== 'string' || password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }
};

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  isEmailVerified: user.isEmailVerified,
  twoFactorEnabled: user.twoFactorEnabled,
  createdAt: user.createdAt
});

const normalizeRecoveryCode = (code) => String(code || '').replace(/[\s-]/g, '').toUpperCase();

const generateRecoveryCodes = () => Array.from({ length: 10 }, () => (
  crypto.randomBytes(8).toString('hex').toUpperCase()
));

const verifySecondFactor = (user, code) => {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) return false;

  if (user.twoFactorSecretEncrypted
    && authenticator.check(normalizedCode, decryptSecret(user.twoFactorSecretEncrypted))) {
    return true;
  }

  const recoveryCodeHash = hashToken(normalizeRecoveryCode(normalizedCode));
  const recoveryCodeIndex = user.twoFactorRecoveryCodeHashes
    .findIndex((storedHash) => storedHash === recoveryCodeHash);
  if (recoveryCodeIndex === -1) return false;

  user.twoFactorRecoveryCodeHashes.splice(recoveryCodeIndex, 1);
  return true;
};

const createSessionCredentials = async (user, metadata = {}) => {
  const tokenId = createTokenId();
  const expiresAt = getRefreshExpiry();
  const session = await AuthSession.create({
    userId: user._id,
    refreshTokenHash: hashToken(tokenId),
    deviceName: String(metadata.deviceName || metadata.userAgent || 'Unknown device').slice(0, 180),
    ipAddress: String(metadata.ipAddress || '').slice(0, 64),
    expiresAt
  });

  return {
    ...createAccessCredentials(user, session._id),
    refreshToken: createRefreshToken(user, session._id, tokenId, expiresAt),
    refreshExpiresAt: expiresAt,
    sessionId: session._id.toString()
  };
};

const register = async (input = {}) => {
  const { name, email, password } = input;
  validateCredentials({ name, email, password }, true);
  const normalizedEmail = normalizeEmail(email);

  if (await User.exists({ email: normalizedEmail })) {
    throw new AppError('An account with this email already exists', 409);
  }

  const verification = createOneTimeToken();
  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    password: await bcrypt.hash(password, 12),
    emailVerificationTokenHash: verification.tokenHash,
    emailVerificationExpires: new Date(Date.now() + verificationTokenMinutes * 60 * 1000)
  });

  await sendVerificationEmail(user, verification.token);

  return {
    user: publicUser(user),
    message: 'Registration successful. Check your email to verify your account.'
  };
};

const verifyEmail = async (token) => {
  if (!token) {
    throw new AppError('Verification token is required', 400);
  }

  const user = await User.findOne({
    emailVerificationTokenHash: hashToken(token),
    emailVerificationExpires: { $gt: new Date() }
  }).select('+emailVerificationTokenHash +emailVerificationExpires');

  if (!user) {
    throw new AppError('Verification token is invalid or expired', 400);
  }

  user.isEmailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  return { message: 'Email verified successfully. You can now log in.' };
};

const resendVerification = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!emailPattern.test(normalizedEmail)) {
    throw new AppError('A valid email is required', 400);
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user || user.isEmailVerified) {
    return { message: 'If the account exists and is unverified, a verification email was sent.' };
  }

  const verification = createOneTimeToken();
  user.emailVerificationTokenHash = verification.tokenHash;
  user.emailVerificationExpires = new Date(Date.now() + verificationTokenMinutes * 60 * 1000);
  await user.save();
  await sendVerificationEmail(user, verification.token);

  return { message: 'If the account exists and is unverified, a verification email was sent.' };
};

const login = async (input = {}, metadata = {}) => {
  const { email, password, twoFactorCode } = input;
  if (!emailPattern.test(normalizeEmail(email)) || typeof password !== 'string' || !password) {
    throw new AppError('Valid email and password are required', 400);
  }

  const user = await User.findOne({ email: normalizeEmail(email) })
    .select('+password +twoFactorSecretEncrypted +twoFactorRecoveryCodeHashes');
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isEmailVerified) {
    throw new AppError('Please verify your email before logging in', 403);
  }

  if (user.twoFactorEnabled) {
    if (!twoFactorCode) return { requiresTwoFactor: true };
    if (!verifySecondFactor(user, twoFactorCode)) {
      throw new AppError('Authenticator or recovery code is invalid', 401);
    }
    await user.save();
  }

  const credentials = await createSessionCredentials(user, metadata);
  user.lastLoginAt = new Date();
  await user.save();

  return {
    ...credentials,
    user: publicUser(user)
  };
};

const listEmployeeAccounts = () => User.find({ role: 'employee' })
  .select('name email role isEmailVerified twoFactorEnabled createdAt lastLoginAt')
  .sort({ createdAt: -1 })
  .lean();

const listManagedAccounts = (viewer) => {
  const query = ['admin', 'super_admin'].includes(viewer.role)
    ? {}
    : { role: { $in: ['employee', 'manager', 'hr'] } };

  return User.find(query)
    .select('name email role isEmailVerified twoFactorEnabled createdAt lastLoginAt')
    .sort({ createdAt: -1 })
    .lean();
};

const refreshSession = async (refreshToken) => {
  if (!refreshToken) throw new AppError('Refresh token is required', 401);

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw new AppError('Refresh token is invalid or expired', 401);
  }

  const session = await AuthSession.findById(payload.sid).select('+refreshTokenHash');
  if (!session || session.userId.toString() !== payload.sub || session.revokedAt
    || session.expiresAt <= new Date()) {
    throw new AppError('Session is invalid or expired', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    session.revokedAt = new Date();
    await session.save();
    throw new AppError('Session is invalid or expired', 401);
  }

  const presentedHash = hashToken(payload.jti);
  if (session.refreshTokenHash !== presentedHash) {
    session.revokedAt = new Date();
    await session.save();
    throw new AppError('Refresh token reuse detected. Sign in again.', 401);
  }

  const nextTokenId = createTokenId();
  const now = new Date();
  const rotatedSession = await AuthSession.findOneAndUpdate(
    {
      _id: session._id,
      userId: user._id,
      refreshTokenHash: presentedHash,
      revokedAt: null,
      expiresAt: { $gt: now }
    },
    {
      $set: {
        refreshTokenHash: hashToken(nextTokenId),
        lastUsedAt: now
      }
    },
    { new: true }
  );

  if (!rotatedSession) {
    await AuthSession.updateOne(
      { _id: session._id, revokedAt: null },
      { $set: { revokedAt: now } }
    );
    throw new AppError('Refresh token reuse detected. Sign in again.', 401);
  }

  return {
    ...createAccessCredentials(user, session._id),
    refreshToken: createRefreshToken(user, session._id, nextTokenId, session.expiresAt),
    refreshExpiresAt: session.expiresAt,
    sessionId: session._id.toString()
  };
};

const listSessions = async (user, currentSessionId) => {
  const sessions = await AuthSession.find({
    userId: user._id,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  }).sort({ lastUsedAt: -1 }).select('deviceName ipAddress createdAt lastUsedAt expiresAt');

  return sessions.map((session) => ({
    id: session._id,
    deviceName: session.deviceName,
    ipAddress: session.ipAddress,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    current: session._id.toString() === currentSessionId
  }));
};

const revokeSession = async (user, sessionId) => {
  const session = await AuthSession.findOneAndUpdate(
    { _id: sessionId, userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true }
  );
  if (!session) throw new AppError('Active session not found', 404);
  return { message: 'Session revoked successfully' };
};

const logout = async (user, sessionId) => {
  if (sessionId) {
    await AuthSession.updateOne(
      { _id: sessionId, userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  } else {
    user.tokenVersion += 1;
    await user.save();
  }
  return { message: 'Logged out successfully' };
};

const logoutAll = async (user) => {
  user.tokenVersion += 1;
  await user.save();
  await AuthSession.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  return { message: 'All sessions have been revoked' };
};

const beginTwoFactorSetup = async (user, password) => {
  const currentUser = await User.findById(user._id).select('+password');
  if (currentUser.twoFactorEnabled) throw new AppError('Two-factor authentication is already enabled', 409);
  if (!(await bcrypt.compare(String(password || ''), currentUser.password))) {
    throw new AppError('Password is invalid', 401);
  }

  const secret = authenticator.generateSecret();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  currentUser.twoFactorPendingSecretEncrypted = encryptSecret(secret);
  currentUser.twoFactorPendingExpires = expiresAt;
  await currentUser.save();

  const otpauthUrl = authenticator.keyuri(currentUser.email, 'Employee Portal', secret);
  return {
    secret,
    qrCode: await QRCode.toDataURL(otpauthUrl),
    expiresAt
  };
};

const enableTwoFactor = async (user, code) => {
  const currentUser = await User.findById(user._id)
    .select('+twoFactorPendingSecretEncrypted +twoFactorPendingExpires');
  if (!currentUser.twoFactorPendingSecretEncrypted
    || !currentUser.twoFactorPendingExpires
    || currentUser.twoFactorPendingExpires <= new Date()) {
    throw new AppError('Two-factor setup expired. Start setup again.', 400);
  }

  const secret = decryptSecret(currentUser.twoFactorPendingSecretEncrypted);
  if (!authenticator.check(String(code || ''), secret)) {
    throw new AppError('Authenticator code is invalid', 400);
  }

  const recoveryCodes = generateRecoveryCodes();
  currentUser.twoFactorEnabled = true;
  currentUser.twoFactorSecretEncrypted = currentUser.twoFactorPendingSecretEncrypted;
  currentUser.twoFactorPendingSecretEncrypted = undefined;
  currentUser.twoFactorPendingExpires = undefined;
  currentUser.twoFactorRecoveryCodeHashes = recoveryCodes.map((value) => hashToken(value));
  await currentUser.save();

  return { message: 'Two-factor authentication enabled', recoveryCodes };
};

const disableTwoFactor = async (user, input = {}) => {
  const currentUser = await User.findById(user._id)
    .select('+password +twoFactorSecretEncrypted +twoFactorRecoveryCodeHashes');
  if (!currentUser.twoFactorEnabled) throw new AppError('Two-factor authentication is not enabled', 409);
  if (!(await bcrypt.compare(String(input.password || ''), currentUser.password))) {
    throw new AppError('Password is invalid', 401);
  }
  if (!verifySecondFactor(currentUser, input.code)) {
    throw new AppError('Authenticator or recovery code is invalid', 401);
  }

  currentUser.twoFactorEnabled = false;
  currentUser.twoFactorSecretEncrypted = undefined;
  currentUser.twoFactorPendingSecretEncrypted = undefined;
  currentUser.twoFactorPendingExpires = undefined;
  currentUser.twoFactorRecoveryCodeHashes = [];
  currentUser.tokenVersion += 1;
  await currentUser.save();
  await AuthSession.updateMany(
    { userId: currentUser._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  return { message: 'Two-factor authentication disabled. Sign in again.' };
};

const regenerateRecoveryCodes = async (user, code) => {
  const currentUser = await User.findById(user._id)
    .select('+twoFactorSecretEncrypted +twoFactorRecoveryCodeHashes');
  if (!currentUser.twoFactorEnabled || !verifySecondFactor(currentUser, code)) {
    throw new AppError('Authenticator or recovery code is invalid', 401);
  }

  const recoveryCodes = generateRecoveryCodes();
  currentUser.twoFactorRecoveryCodeHashes = recoveryCodes.map((value) => hashToken(value));
  await currentUser.save();
  return { recoveryCodes };
};

const getProfile = (user) => publicUser(user);

const assignRole = async (adminUser, input = {}) => {
  const email = normalizeEmail(input.email);
  const role = input.role;

  if (!emailPattern.test(email)) {
    throw new AppError('A valid user email is required', 400);
  }

  const knownRoles = ['employee', 'manager', 'hr', 'hr_manager', 'admin', 'super_admin'];
  if (!knownRoles.includes(role)) {
    throw new AppError('Invalid role', 400);
  }

  if (normalizeEmail(adminUser.email) === email) {
    throw new AppError('You cannot change your own role', 400);
  }

  const assignableRoles = adminUser.role === 'super_admin'
    ? knownRoles
    : adminUser.role === 'admin'
      ? ['employee', 'manager', 'hr', 'hr_manager', 'admin']
      : ['employee', 'manager', 'hr'];

  if (!assignableRoles.includes(role)) {
    throw new AppError('Your role is not allowed to assign this role', 403);
  }

  const user = await User.findOneAndUpdate(
    { email },
    { role },
    { new: true, runValidators: true }
  );

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return { user: publicUser(user), message: `User role updated to ${role}` };
};

const forgotPassword = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!emailPattern.test(normalizedEmail)) {
    throw new AppError('A valid email is required', 400);
  }

  const user = await User.findOne({ email: normalizedEmail });
  const response = { message: 'If the account exists, a password reset email was sent.' };

  if (!user) {
    return response;
  }

  const reset = createOneTimeToken();
  user.passwordResetTokenHash = reset.tokenHash;
  user.passwordResetExpires = new Date(Date.now() + resetTokenMinutes * 60 * 1000);
  await user.save();
  await sendPasswordResetEmail(user, reset.token);

  return response;
};

const resetPassword = async (token, password) => {
  if (!token) {
    throw new AppError('Reset token is required', 400);
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  const user = await User.findOne({
    passwordResetTokenHash: hashToken(token),
    passwordResetExpires: { $gt: new Date() }
  }).select('+passwordResetTokenHash +passwordResetExpires');

  if (!user) {
    throw new AppError('Reset token is invalid or expired', 400);
  }

  user.password = await bcrypt.hash(password, 12);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  user.tokenVersion += 1;
  await user.save();
  await AuthSession.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  return { message: 'Password reset successfully. Please log in again.' };
};

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  refreshSession,
  getProfile,
  listEmployeeAccounts,
  listManagedAccounts,
  listSessions,
  revokeSession,
  logoutAll,
  beginTwoFactorSetup,
  enableTwoFactor,
  disableTwoFactor,
  regenerateRecoveryCodes,
  assignRole,
  forgotPassword,
  resetPassword,
  logout
};
