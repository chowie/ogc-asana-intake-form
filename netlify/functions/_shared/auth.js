import crypto from 'node:crypto'

const DEFAULT_TTL_MS = 60 * 60 * 1000 // 1 hour

function getSecret() {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return secret
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

/**
 * Issues a stateless signed session token: `${exp}.${nonce}.${sig}`.
 * Requires AUTH_SECRET. Throws if it is unset (caller should 500).
 */
export function issueToken(ttlMs = DEFAULT_TTL_MS) {
  const exp = Date.now() + ttlMs
  const nonce = crypto.randomBytes(9).toString('base64url')
  const payload = `${exp}.${nonce}`
  return { token: `${payload}.${sign(payload)}`, expiresAt: exp }
}

/**
 * Verifies a token's signature and expiry. Returns false for empty,
 * malformed, tampered, or expired tokens. Never throws on bad input.
 */
export function verifyToken(token) {
  if (typeof token !== 'string') return false
  const parts = token.split('.')
  if (parts.length !== 3) return false

  const [exp, nonce, sig] = parts
  let expected
  try {
    expected = sign(`${exp}.${nonce}`)
  } catch {
    return false // AUTH_SECRET unset — fail closed
  }

  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length) return false
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false

  const expMs = Number(exp)
  return Number.isFinite(expMs) && expMs > Date.now()
}

/**
 * Guard for protected functions. Returns a 403 response object when the
 * request lacks a valid token, or null when authorized.
 */
export function requireAuth(body) {
  if (verifyToken(body?.passphraseToken)) return null
  return {
    statusCode: 403,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Forbidden' }),
  }
}
