const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const { jwtExpiresIn, verificationTokenMinutes, resetTokenMinutes } = require('../config/env');
const { createOneTimeToken, hashToken, createAccessToken } = require('../utils/token');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');

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
  createdAt: user.createdAt
});

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

const login = async (input = {}) => {
  const { email, password } = input;
  if (!emailPattern.test(normalizeEmail(email)) || typeof password !== 'string' || !password) {
    throw new AppError('Valid email and password are required', 400);
  }

  const user = await User.findOne({ email: normalizeEmail(email) }).select('+password');
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isEmailVerified) {
    throw new AppError('Please verify your email before logging in', 403);
  }

  return {
    token: createAccessToken(user),
    expiresIn: jwtExpiresIn,
    user: publicUser(user)
  };
};

const getProfile = (user) => publicUser(user);

const assignRole = async (adminUser, input = {}) => {
  const email = normalizeEmail(input.email);
  const role = input.role;

  if (!emailPattern.test(email)) {
    throw new AppError('A valid user email is required', 400);
  }

  if (!['employee', 'hr'].includes(role)) {
    throw new AppError('Role must be employee or hr', 400);
  }

  if (adminUser.email === email) {
    throw new AppError('An admin cannot change their own role', 400);
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

  return { message: 'Password reset successfully. Please log in again.' };
};

const logout = async (user) => {
  user.tokenVersion += 1;
  await user.save();
  return { message: 'Logged out successfully' };
};

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  getProfile,
  assignRole,
  forgotPassword,
  resetPassword,
  logout
};
