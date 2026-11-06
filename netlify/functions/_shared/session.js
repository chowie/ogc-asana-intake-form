import { getRedis } from './redis.js'
import { hashToken, newToken } from './tokens.js'
import { appUrl, json } from './http.js'

export const SESSION_TTL_SEC = 30 * 60 // sliding: refreshed on every authenticated request
export const COOKIE_NAME = 'ogc_session'

// The cookie is a browser-session cookie (no Max-Age): the 30-minute sliding
// expiry lives server-side in the Redis TTL, so protected functions only need
// a GETEX to extend it — no Set-Cookie on every response.
function cookie(value, { clear = false } = {}) {
  // Secure is dropped only for plain-http local dev (netlify dev on localhost).
  const secure = appUrl().startsWith('http://localhost') ? '' : '; Secure'
  return `${COOKIE_NAME}=${value}; HttpOnly${secure}; SameSite=Strict; Path=/${clear ? '; Max-Age=0' : ''}`
}

function readCookie(event) {
  const header = event.headers?.cookie ?? event.headers?.Cookie ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE_NAME) return v.join('=')
  }
  return ''
}

/** Creates a session and returns the Set-Cookie header value. */
export async function createSession(email) {
  const id = newToken()
  await getRedis().set(`sess:${hashToken(id)}`, { email }, { ex: SESSION_TTL_SEC })
  return cookie(id)
}

/** Returns { email } for a live session (sliding its TTL), else { email: null }. Fails closed. */
export async function getSession(event) {
  const id = readCookie(event)
  if (!id) return { email: null }
  const redis = getRedis()
  if (!redis) return { email: null }
  try {
    const email = (await redis.getex(`sess:${hashToken(id)}`, { ex: SESSION_TTL_SEC }))?.email
    if (!email) return { email: null }
    // Re-check the account on every request so deleting a user (or setting
    // status to anything but active) revokes access immediately.
    const user = await redis.get(`user:${email}`)
    return { email: user?.status === 'active' ? email : null }
  } catch (err) {
    console.error(`[session] lookup failed: ${err.message}`)
    return { email: null }
  }
}

/**
 * Guard for protected functions. Returns { email } when authorized,
 * or { error } holding a 401 response.
 */
export async function requireSession(event) {
  const session = await getSession(event)
  if (session.email) return session
  return { error: json(401, { error: 'Your session has expired. Please sign in again.' }) }
}

/** Deletes the session; returns a Set-Cookie header that clears the cookie. */
export async function destroySession(event) {
  const id = readCookie(event)
  if (id) await getRedis()?.del(`sess:${hashToken(id)}`)
  return cookie('', { clear: true })
}
