process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/employee_crud_test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';
process.env.ACCESS_TOKEN_MINUTES = '15';

const bcrypt = require('bcryptjs');

jest.mock('../models/userModel', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  find: jest.fn()
}));

jest.mock('../models/authSessionModel', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn()
}));

const User = require('../models/userModel');
const AuthSession = require('../models/authSessionModel');
const { authenticator } = require('otplib');
const authService = require('../services/authService');
const { hashToken, createRefreshToken } = require('../utils/token');
const { decryptSecret } = require('../utils/totp');

const userId = '507f1f77bcf86cd799439011';
const sessionId = '507f1f77bcf86cd799439012';
const tokenId = 'current-refresh-id';

const createSession = (refreshTokenHash = hashToken(tokenId)) => ({
  _id: sessionId,
  userId,
  refreshTokenHash,
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  save: jest.fn().mockResolvedValue(undefined)
});

const createRefreshCredential = (id = tokenId) => createRefreshToken(
  { _id: userId, tokenVersion: 0 },
  sessionId,
  id,
  new Date(Date.now() + 60 * 60 * 1000)
);

describe('auth refresh sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockResolvedValue({ _id: userId, tokenVersion: 0 });
  });

  test('rotates a refresh token with a compare-and-swap update', async () => {
    const session = createSession();
    AuthSession.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(session) });
    AuthSession.findOneAndUpdate.mockResolvedValue(session);

    const result = await authService.refreshSession(createRefreshCredential());

    expect(AuthSession.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ refreshTokenHash: hashToken(tokenId), revokedAt: null }),
      expect.objectContaining({ $set: expect.objectContaining({ refreshTokenHash: expect.any(String) }) }),
      { new: true }
    );
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.sessionId).toBe(sessionId);
  });

  test('revokes a session when an already-rotated refresh token is replayed', async () => {
    const session = createSession(hashToken('newer-refresh-id'));
    AuthSession.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(session) });

    await expect(authService.refreshSession(createRefreshCredential()))
      .rejects.toMatchObject({ statusCode: 401, message: 'Refresh token reuse detected. Sign in again.' });
    expect(session.save).toHaveBeenCalled();
    expect(session.revokedAt).toBeInstanceOf(Date);
  });

  test('requires the current password to begin TOTP enrollment', async () => {
    const currentUser = {
      _id: userId,
      email: 'person@example.com',
      password: '$2a$04$Jwz7bIZ7lVqD6R9gJ4xgGu8CAc.sQKdF0s5uYv2kVLnPOm8hYB2oK',
      twoFactorEnabled: false,
      save: jest.fn().mockResolvedValue(undefined)
    };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(currentUser) });

    await expect(authService.beginTwoFactorSetup({ _id: userId }, 'incorrect-password'))
      .rejects.toMatchObject({ statusCode: 401, message: 'Password is invalid' });
  });

  test('enables TOTP only after a valid code and stores hashed recovery codes', async () => {
    const secret = authenticator.generateSecret();
    const { encryptSecret } = require('../utils/totp');
    const currentUser = {
      _id: userId,
      twoFactorEnabled: false,
      twoFactorPendingSecretEncrypted: encryptSecret(secret),
      twoFactorPendingExpires: new Date(Date.now() + 60_000),
      save: jest.fn().mockResolvedValue(undefined)
    };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(currentUser) });

    const result = await authService.enableTwoFactor({ _id: userId }, authenticator.generate(secret));

    expect(currentUser.twoFactorEnabled).toBe(true);
    expect(currentUser.twoFactorSecretEncrypted).not.toBe(secret);
    expect(currentUser.twoFactorRecoveryCodeHashes).toHaveLength(10);
    expect(currentUser.twoFactorRecoveryCodeHashes).toEqual(
      result.recoveryCodes.map((code) => hashToken(code))
    );
    expect(result.recoveryCodes).toHaveLength(10);
  });

  test('requires a second factor after a valid password when MFA is enabled', async () => {
    const currentUser = {
      _id: userId,
      email: 'person@example.com',
      name: 'Person Example',
      role: 'employee',
      isEmailVerified: true,
      twoFactorEnabled: true,
      password: bcrypt.hashSync('Password123', 4),
      twoFactorRecoveryCodeHashes: []
    };
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(currentUser) });

    await expect(authService.login({ email: currentUser.email, password: 'Password123' }))
      .resolves.toEqual({ requiresTwoFactor: true });
    expect(AuthSession.create).not.toHaveBeenCalled();
  });

  test('consumes a hashed recovery code once at login', async () => {
    const recoveryCode = 'A1B2C3D4E5F60708';
    const currentUser = {
      _id: userId,
      email: 'person@example.com',
      name: 'Person Example',
      role: 'employee',
      isEmailVerified: true,
      twoFactorEnabled: true,
      password: bcrypt.hashSync('Password123', 4),
      twoFactorSecretEncrypted: null,
      twoFactorRecoveryCodeHashes: [hashToken(recoveryCode)],
      save: jest.fn().mockResolvedValue(undefined)
    };
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(currentUser) });
    AuthSession.create.mockResolvedValue({ _id: sessionId });

    const result = await authService.login({
      email: currentUser.email,
      password: 'Password123',
      twoFactorCode: recoveryCode.toLowerCase()
    });

    expect(currentUser.twoFactorRecoveryCodeHashes).toEqual([]);
    expect(currentUser.save).toHaveBeenCalled();
    expect(currentUser.lastLoginAt).toBeInstanceOf(Date);
    expect(AuthSession.create).toHaveBeenCalledWith(expect.objectContaining({ userId: userId }));
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
  });

  test('lists employee account fields without selecting credentials or secrets', async () => {
    const accounts = [{ name: 'Employee', email: 'employee@example.com' }];
    const query = {
      select: jest.fn(),
      sort: jest.fn(),
      lean: jest.fn().mockResolvedValue(accounts)
    };
    query.select.mockReturnValue(query);
    query.sort.mockReturnValue(query);
    User.find.mockReturnValue(query);

    await expect(authService.listEmployeeAccounts()).resolves.toBe(accounts);

    expect(User.find).toHaveBeenCalledWith({ role: 'employee' });
    expect(query.select).toHaveBeenCalledWith(
      'name email role isEmailVerified twoFactorEnabled createdAt lastLoginAt'
    );
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  test('lists accounts within the HR role-management scope', async () => {
    const accounts = [{ name: 'Employee', email: 'employee@example.com', role: 'employee' }];
    const query = {
      select: jest.fn(),
      sort: jest.fn(),
      lean: jest.fn().mockResolvedValue(accounts)
    };
    query.select.mockReturnValue(query);
    query.sort.mockReturnValue(query);
    User.find.mockReturnValue(query);

    await expect(authService.listManagedAccounts({ role: 'hr' })).resolves.toBe(accounts);

    expect(User.find).toHaveBeenCalledWith({ role: { $in: ['employee', 'manager', 'hr'] } });
    expect(query.select).toHaveBeenCalledWith(
      'name email role isEmailVerified twoFactorEnabled createdAt lastLoginAt'
    );
  });

  test('allows HR to assign permitted roles to another account', async () => {
    const updatedUser = {
      _id: userId,
      name: 'Manager Example',
      email: 'manager@example.com',
      role: 'manager',
      isEmailVerified: true,
      twoFactorEnabled: false,
      createdAt: new Date()
    };
    User.findOneAndUpdate.mockResolvedValue(updatedUser);

    await expect(authService.assignRole(
      { email: 'hr@example.com', role: 'hr' },
      { email: updatedUser.email, role: 'manager' }
    )).resolves.toMatchObject({ user: { role: 'manager' } });

    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { email: updatedUser.email },
      { role: 'manager' },
      { new: true, runValidators: true }
    );
  });

  test('prevents HR from granting administrator roles', async () => {
    await expect(authService.assignRole(
      { email: 'hr@example.com', role: 'hr' },
      { email: 'new-admin@example.com', role: 'admin' }
    )).rejects.toMatchObject({ statusCode: 403 });

    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
