import { getRedis } from './redis.js'

// Bare addr-spec only: no quotes, angle brackets, or other display-name syntax
// (Resend would parse `x<evil@example.com>` as a name + address).
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/

export const MAX_NAME_LEN = 50

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export function isValidEmail(email) {
  return EMAIL_RE.test(email) && email.length <= 254
}

/** Trims a person's name, strips control characters, and caps its length. */
export function sanitizeName(name) {
  if (typeof name !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN)
}

/** "First Last", or the email when the account has no name yet. */
export function displayName(user) {
  if (!user) return ''
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
}

/** Designated inviters, from the comma-separated INVITER_EMAILS env var. */
export function isInviter(email) {
  const list = (process.env.INVITER_EMAILS ?? '').split(',').map(normalizeEmail).filter(Boolean)
  return list.includes(normalizeEmail(email))
}

/**
 * Inviters' addresses are fixed by configuration, and a Google account's email
 * belongs to Google — neither may be changed in the app.
 */
export function canChangeEmail(user) {
  return !!user && !isInviter(user.email) && user.provider !== 'google' && user.lastLoginMethod !== 'google'
}

/** The signed-in user as the client sees it (session, login, verify, profile responses). */
export function sessionPayload(user) {
  return {
    authenticated: true,
    email: user.email,
    name: displayName(user),
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    canInvite: isInviter(user.email),
    canChangeEmail: canChangeEmail(user),
    needsProfile: !user.profileConfirmedAt,
  }
}

export async function getUser(email) {
  return (await getRedis().get(`user:${normalizeEmail(email)}`)) ?? null
}

/**
 * Saves a user record. Records are durable from the moment someone is
 * invited (status invited → pending → active), so the Users tray can show
 * invites that were never accepted.
 */
export async function saveUser(user) {
  await getRedis().set(`user:${normalizeEmail(user.email)}`, user)
  return user
}

/**
 * Merges fields into an existing user record. Returns the updated user, or
 * null if missing. XX: if the record was deleted meanwhile (e.g. moved by an
 * email change), the write is dropped rather than resurrecting it.
 */
export async function updateUser(email, fields) {
  const user = await getUser(email)
  if (!user) return null
  const updated = { ...user, ...fields }
  const ok = await getRedis().set(`user:${normalizeEmail(email)}`, updated, { xx: true })
  return ok ? updated : null
}

/** Every user record (any status). SCAN is fine at this scale — tens of accounts. */
export async function listUsers() {
  const redis = getRedis()
  const keys = []
  let cursor = '0'
  do {
    const [next, batch] = await redis.scan(cursor, { match: 'user:*', count: 200 })
    keys.push(...batch)
    cursor = String(next)
  } while (cursor !== '0')
  if (keys.length === 0) return []
  const users = await Promise.all(keys.map((k) => redis.get(k)))
  return users.filter(Boolean)
}

/**
 * An email may sign in if the account is active, or if it is a designated
 * inviter with no record yet (auto-provisioned on first sign-in — this
 * bootstraps the system). To revoke an inviter, remove them from
 * INVITER_EMAILS and set their record's status to "disabled".
 */
export async function canSignIn(email) {
  const user = await getUser(email)
  // A designated inviter who was also sent an invite still bootstraps (keeping
  // the invite's names). Any other non-active status (e.g. disabled) is respected.
  if (user?.status === 'invited' && isInviter(email)) {
    await updateUser(email, { status: 'active', provider: 'email', acceptedAt: Date.now() })
    return true
  }
  if (user) return user.status === 'active'
  if (isInviter(email)) {
    const now = Date.now()
    await saveUser({ email: normalizeEmail(email), status: 'active', provider: 'email', createdAt: now, acceptedAt: now })
    return true
  }
  return false
}
