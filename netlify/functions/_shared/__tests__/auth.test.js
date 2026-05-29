import { beforeEach, describe, expect, it } from 'vitest'
import { issueToken, verifyToken, requireAuth } from '../auth.js'

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-value'
})

describe('auth token', () => {
  it('verifies a freshly issued token', () => {
    const { token } = issueToken()
    expect(verifyToken(token)).toBe(true)
  })

  it('returns expiresAt in the future', () => {
    const { expiresAt } = issueToken()
    expect(expiresAt).toBeGreaterThan(Date.now())
  })

  it('rejects empty, malformed, and non-string tokens', () => {
    expect(verifyToken('')).toBe(false)
    expect(verifyToken('a.b')).toBe(false)
    expect(verifyToken(undefined)).toBe(false)
    expect(verifyToken(null)).toBe(false)
    expect(verifyToken(12345)).toBe(false)
  })

  it('rejects a tampered signature', () => {
    const { token } = issueToken()
    const [exp, nonce] = token.split('.')
    expect(verifyToken(`${exp}.${nonce}.forgedsignature`)).toBe(false)
  })

  it('rejects a token signed with a different secret', () => {
    const { token } = issueToken()
    process.env.AUTH_SECRET = 'a-different-secret'
    expect(verifyToken(token)).toBe(false)
  })

  it('rejects an expired token', () => {
    const { token } = issueToken(-1000) // already expired
    expect(verifyToken(token)).toBe(false)
  })

  it('rejects when AUTH_SECRET is unset (fails closed)', () => {
    const { token } = issueToken()
    delete process.env.AUTH_SECRET
    expect(verifyToken(token)).toBe(false)
  })
})

describe('requireAuth', () => {
  it('returns null for a valid token', () => {
    const { token } = issueToken()
    expect(requireAuth({ passphraseToken: token })).toBeNull()
  })

  it('returns a 403 response for a missing/invalid token', () => {
    expect(requireAuth({}).statusCode).toBe(403)
    expect(requireAuth({ passphraseToken: 'bogus' }).statusCode).toBe(403)
  })
})
