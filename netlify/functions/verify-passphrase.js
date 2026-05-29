import crypto from 'node:crypto'
import { issueToken } from './_shared/auth.js'
import { limit } from './_shared/rate-limit.js'

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const passphrase = process.env.PASSPHRASE
  if (!passphrase || !process.env.AUTH_SECRET) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server misconfigured' }),
    }
  }

  const limited = await limit(event, { id: 'verify-passphrase', max: 5, windowSec: 60 })
  if (limited) return limited

  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON' }),
    }
  }

  const valid = typeof body.passphrase === 'string' && timingSafeEqualStr(body.passphrase, passphrase)
  if (!valid) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valid: false }),
    }
  }

  const { token, expiresAt } = issueToken()
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ valid: true, token, expiresAt }),
  }
}
