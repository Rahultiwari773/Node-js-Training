const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { jwtSecret, accessTokenMinutes, refreshTokenDays } = require('../config/env');

const createOneTimeToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  return { token, tokenHash };
};

const hashToken = (token) => crypto
  .createHash('sha256')
  .update(token)
  .digest('hex');

const createAccessToken = (user, sessionId) => jwt.sign(
  {
    sub: user._id.toString(),
    tokenVersion: user.tokenVersion,
    purpose: 'access',
    ...(sessionId ? { sid: sessionId.toString() } : {})
  },
  jwtSecret,
  { expiresIn: accessTokenMinutes * 60 }
);

const createRefreshToken = (user, sessionId, tokenId, expiresAt) => jwt.sign(
  {
    sub: user._id.toString(),
    tokenVersion: user.tokenVersion,
    purpose: 'refresh',
    sid: sessionId.toString(),
    jti: tokenId
  },
  jwtSecret,
  { expiresIn: Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) }
);

const verifyRefreshToken = (token) => {
  const payload = jwt.verify(token, jwtSecret);
  if (payload.purpose !== 'refresh' || !payload.sid || !payload.jti) {
    throw new jwt.JsonWebTokenError('Invalid refresh token');
  }
  return payload;
};

const createTokenId = () => crypto.randomBytes(32).toString('hex');

const createAccessCredentials = (user, sessionId) => ({
  accessToken: createAccessToken(user, sessionId),
  expiresIn: accessTokenMinutes * 60
});

const getRefreshExpiry = () => new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000);

const createFilePreviewToken = (user, employeeId, fileId) => jwt.sign(
  {
    sub: user._id.toString(),
    tokenVersion: user.tokenVersion,
    purpose: 'file-access',
    employeeId: employeeId.toString(),
    fileId: fileId.toString()
  },
  jwtSecret,
  { expiresIn: '10m' }
);

module.exports = {
  createOneTimeToken,
  hashToken,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  createTokenId,
  createAccessCredentials,
  getRefreshExpiry,
  createFilePreviewToken
};
