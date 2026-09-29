const crypto = require('crypto');
const { jwtSecret } = require('../config/env');

const encryptionKey = crypto.createHash('sha256')
  .update(`employee-portal-totp:${jwtSecret}`)
  .digest();

const encryptSecret = (secret) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((value) => value.toString('base64url')).join('.');
};

const decryptSecret = (encrypted) => {
  const [encodedIv, encodedTag, encodedCiphertext] = encrypted.split('.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey,
    Buffer.from(encodedIv, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final()
  ]).toString('utf8');
};

module.exports = { encryptSecret, decryptSecret };