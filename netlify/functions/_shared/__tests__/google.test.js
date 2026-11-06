import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'

// Real jose verification, with Google's remote JWKS swapped for a local key set.
const keys = vi.hoisted(() => ({ jwks: null }))
vi.mock('jose', async (importOriginal) => ({
  ...(await importOriginal()),
  createRemoteJWKSet: () => (...args) => keys.jwks(...args),
}))

import { verifyGoogleIdToken } from '../google.js'

let privateKey
let otherKey

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  otherKey = (await generateKeyPair('RS256')).privateKey
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }
  keys.jwks = createLocalJWKSet({ keys: [jwk] })
})

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'client-123.apps.googleusercontent.com'
})

function idToken(claims = {}, { key = privateKey, aud = process.env.GOOGLE_CLIENT_ID, iss = 'https://accounts.google.com', exp = '1h' } = {}) {
  return new SignJWT({ email: 'Member@Example.com', email_verified: true, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key)
}

describe('verifyGoogleIdToken', () => {
  it('returns the normalized email for a valid token', async () => {
    expect(await verifyGoogleIdToken(await idToken())).toBe('member@example.com')
  })

  it('rejects a token issued for a different client (audience)', async () => {
    expect(await verifyGoogleIdToken(await idToken({}, { aud: 'someone-else' }))).toBeNull()
  })

  it('rejects a token from a different issuer', async () => {
    expect(await verifyGoogleIdToken(await idToken({}, { iss: 'https://evil.example.com' }))).toBeNull()
  })

  it('rejects a token signed by an unknown key', async () => {
    expect(await verifyGoogleIdToken(await idToken({}, { key: otherKey }))).toBeNull()
  })

  it('rejects an expired token', async () => {
    expect(await verifyGoogleIdToken(await idToken({}, { exp: Math.floor(Date.now() / 1000) - 60 }))).toBeNull()
  })

  it('rejects an unverified email', async () => {
    expect(await verifyGoogleIdToken(await idToken({ email_verified: false }))).toBeNull()
  })

  it('rejects everything when GOOGLE_CLIENT_ID is unset', async () => {
    const token = await idToken()
    delete process.env.GOOGLE_CLIENT_ID
    expect(await verifyGoogleIdToken(token)).toBeNull()
  })

  it('rejects garbage', async () => {
    expect(await verifyGoogleIdToken('not.a.jwt')).toBeNull()
    expect(await verifyGoogleIdToken(undefined)).toBeNull()
  })
})
