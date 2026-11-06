import { getRedis } from './redis.js'

// Bare addr-spec only: no quotes, angle brackets, or other display-name syntax
// (Resend would parse `x<evil@example.com>` as a name + address).
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export function isValidEmail(email) {
  return EMAIL_RE.test(email) && email.length <= 254
}

/** Designated inviters, from the comma-separated INVITER_EMAILS env var. */
export function isInviter(email) {
  const list = (process.env.INVITER_EMAILS ?? '').split(',').map(normalizeEmail).filter(Boolean)
  return list.includes(normalizeEmail(email))
}

export async function getUser(email) {
  return (await getRedis().get(`user:${normalizeEmail(email)}`)) ?? null
}

/** Saves a user. Pass ttlSec for pending accounts so abandoned registrations expire. */
export async function saveUser(user, ttlSec) {
  await getRedis().set(`user:${normalizeEmail(user.email)}`, user, ...(ttlSec ? [{ ex: ttlSec }] : []))
  return user
}

/**
 * An email may sign in if the account is active, or if it is a designated
 * inviter with no record yet (auto-provisioned on first sign-in — this
 * bootstraps the system). To revoke an inviter, remove them from
 * INVITER_EMAILS and set their record's status to "disabled".
 */
export async function canSignIn(email) {
  const user = await getUser(email)
  if (user) return user.status === 'active' // an explicit non-active status (e.g. disabled) is respected
  if (isInviter(email)) {
    await saveUser({ email: normalizeEmail(email), status: 'active', provider: 'email', createdAt: Date.now() })
    return true
  }
  return false
}
