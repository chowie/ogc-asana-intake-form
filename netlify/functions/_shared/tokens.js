import crypto from 'node:crypto'

/** 32 random bytes, base64url — the raw value only ever leaves in a link. */
export function newToken() {
  return crypto.randomBytes(32).toString('base64url')
}

/** SHA-256 of a token. Only hashes are stored, so a Redis leak exposes no usable tokens. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

/** True for a plausible raw token (cheap shape check before hitting Redis). */
export function isTokenShape(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)
}
