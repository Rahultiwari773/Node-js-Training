process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/employee_crud_test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';

const { decryptSecret, encryptSecret } = require('../utils/totp');

describe('TOTP secret encryption', () => {
  test('encrypts secrets and decrypts them only with an intact authentication tag', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptSecret(secret);
    const [iv, tag, ciphertext] = encrypted.split('.');
    const changedTag = `${tag[0] === 'A' ? 'B' : 'A'}${tag.slice(1)}`;

    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
    expect(() => decryptSecret([iv, changedTag, ciphertext].join('.'))).toThrow();
  });
});
