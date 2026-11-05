import { generateKeyPairSync, sign } from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyGoogleToken } from '../utils/google-token.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { ...publicKey.export({ format: 'jwk' }), kid: 'test' };
const payload = {
  iss: 'https://accounts.google.com',
  aud: 'client',
  nonce: 'nonce',
  sub: '123',
  email: 'test@example.com',
  email_verified: true,
  iat: Date.now() / 1000,
  exp: Date.now() / 1000 + 600,
};
const encode = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt = (p) => {
  const body = encode({ alg: 'RS256', kid: 'test' }) + '.' + encode(p);
  return body + '.' + sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url');
};

assert.equal(verifyGoogleToken(jwt(payload), [key], 'client', 'nonce').sub, '123');
for (const change of [
  { aud: 'other' },
  { iss: 'https://evil.example' },
  { exp: 0 },
  { nonce: 'bad' },
  { email_verified: false },
  { iat: Date.now() / 1000 + 600 },
]) {
  assert.throws(() => verifyGoogleToken(jwt({ ...payload, ...change }), [key], 'client', 'nonce'));
}
assert.throws(() => verifyGoogleToken(jwt(payload).slice(0, -5) + 'aaaaa', [key], 'client', 'nonce'));
console.log('PASS: signed Google token verification; rejects wrong audience, issuer, expiry, nonce, unverified email, future issue time, and tampering.');

