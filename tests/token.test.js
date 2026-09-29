process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/employee_crud_test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';
process.env.JWT_EXPIRES_IN = '1h';

const jwt = require('jsonwebtoken');
const {
  createOneTimeToken,
  hashToken,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  createFilePreviewToken
} = require('../utils/token');

describe('token utilities', () => {
  const user = {
    _id: '507f1f77bcf86cd799439011',
    tokenVersion: 3
  };

  test('creates a one-time token and matching hash', () => {
    const result = createOneTimeToken();

    expect(result.token).toHaveLength(64);
    expect(result.tokenHash).toHaveLength(64);
    expect(result.tokenHash).toBe(hashToken(result.token));
    expect(result.tokenHash).not.toBe(result.token);
  });

  test('creates an access token with the user identity and version', () => {
    const token = createAccessToken(user, '507f1f77bcf86cd799439012');
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    expect(payload.sub).toBe(user._id);
    expect(payload.tokenVersion).toBe(3);
    expect(payload.purpose).toBe('access');
    expect(payload.sid).toBe('507f1f77bcf86cd799439012');
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  test('creates refresh tokens scoped to a session and rejects access tokens as refresh tokens', () => {
    const sessionId = '507f1f77bcf86cd799439012';
    const token = createRefreshToken(user, sessionId, 'rotating-id', new Date(Date.now() + 3600_000));
    const payload = verifyRefreshToken(token);

    expect(payload.purpose).toBe('refresh');
    expect(payload.sid).toBe(sessionId);
    expect(payload.jti).toBe('rotating-id');
    expect(() => verifyRefreshToken(createAccessToken(user, sessionId))).toThrow();
  });

  test('scopes file preview tokens to one file', () => {
    const token = createFilePreviewToken(user, '507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013');
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    expect(payload.purpose).toBe('file-access');
    expect(payload.employeeId).toBe('507f1f77bcf86cd799439012');
    expect(payload.fileId).toBe('507f1f77bcf86cd799439013');
  });
});