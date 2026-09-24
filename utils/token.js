const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn } = require('../config/env');

const createOneTimeToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  return { token, tokenHash };
};

const hashToken = (token) => crypto
  .createHash('sha256')
  .update(token)
  .digest('hex');

const createAccessToken = (user) => jwt.sign(
  { sub: user._id.toString(), tokenVersion: user.tokenVersion },
  jwtSecret,
  { expiresIn: jwtExpiresIn }
);

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
  createFilePreviewToken
};
