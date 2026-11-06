import { createRemoteJWKSet, jwtVerify } from 'jose'
import { normalizeEmail } from './users.js'

let jwks = null

/**
 * Verifies a Google Identity Services ID token (the `credential` from the
 * Sign in with Google button). Returns the verified, normalized email, or
 * null if the token is invalid, for another client, or the email is unverified.
 */
export async function verifyGoogleIdToken(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId || typeof credential !== 'string' || !credential) return null
  jwks ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
  try {
    const { payload } = await jwtVerify(credential, jwks, {
      audience: clientId,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
    })
    if (payload.email_verified !== true || !payload.email) return null
    return normalizeEmail(payload.email)
  } catch {
    return null
  }
}
