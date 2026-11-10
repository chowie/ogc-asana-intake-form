import { getRedis } from './redis.js'
import { hashToken, newToken } from './tokens.js'
import { appUrl, json } from './http.js'
import { sessionPayload, updateUser } from './users.js'

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

/**
 * Starts a session for an active user, records the login (shown in the
 * Users tray), and returns the 200 response carrying the session cookie.
 * method: 'email' (magic link / confirmation link) or 'google'.
 */
export async function signedInResponse(email, method) {
  const user = await updateUser(email, { lastLoginAt: Date.now(), lastLoginMethod: method })
  if (user?.status !== 'active') return json(410, { error: 'This account is no longer available. Please sign in again.' })
  const setCookie = await createSession(email)
  return json(200, sessionPayload(user), { 'Set-Cookie': setCookie })
}

/** Returns { email } for a live session (sliding its TTL), else { email: null }. Fails closed. */
export async function getSession(event) {
  const id = readCookie(event)
  if (!id) return { email: null }
  const redis = getRedis()
  if (!redis) return { email: null }
  try {
    const key = `sess:${hashToken(id)}`
    const email = (await redis.getex(key, { ex: SESSION_TTL_SEC }))?.email
    if (!email) return { email: null }
    // Re-check the account on every request so deleting a user (or setting
    // status to anything but active) revokes access immediately. The dead
    // session is deleted too, so it can't come back to life if that address
    // is later re-created (e.g. re-invited after an email change).
    const user = await redis.get(`user:${email}`)
    if (user?.status === 'active') return { email }
    await redis.del(key)
    return { email: null }
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
