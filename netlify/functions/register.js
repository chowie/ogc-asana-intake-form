import { getRedis } from './_shared/redis.js'
import { getUser, isValidEmail, normalizeEmail, saveUser } from './_shared/users.js'
import { hashToken, isTokenShape } from './_shared/tokens.js'
import { sendConfirmation, VERIFY_TTL_SEC } from './_shared/verification.js'
import { verifyGoogleIdToken } from './_shared/google.js'
import { json, parseJsonPost } from './_shared/http.js'
import { limit } from './_shared/rate-limit.js'

const INVITE_GONE = () => json(410, { error: 'This invite link has expired or has already been used. Ask for a new one.' })

// POST { inviteToken, email } | { inviteToken, googleCredential }
export async function handler(event) {
  const { body, error } = parseJsonPost(event)
  if (error) return error

  const limited = await limit(event, { id: 'register', max: 10, windowSec: 60 })
  if (limited) return limited

  if (!isTokenShape(body.inviteToken)) return INVITE_GONE()

  let email
  let provider
  if (body.googleCredential) {
    email = await verifyGoogleIdToken(body.googleCredential)
    if (!email) return json(401, { error: "We couldn't verify your Google account. Please try again." })
    provider = 'google'
  } else {
    email = normalizeEmail(body.email)
    if (!isValidEmail(email)) return json(422, { error: 'Please enter a valid email address.' })
    provider = 'email'
  }

  try {
    const redis = getRedis()
    const key = `invite:${hashToken(body.inviteToken)}`
    const invite = await redis.get(key)
    if (!invite) return INVITE_GONE()

    // Check the match before consuming, so a typo doesn't burn the invite.
    if (normalizeEmail(invite.email) !== email) {
      return json(422, {
        error: provider === 'google'
          ? 'That Google account does not match the email this invite was sent to.'
          : 'That email does not match the one this invite was sent to.',
      })
    }

    // Check the account before consuming, so an already-active user keeps the invite unburned.
    const existing = await getUser(email)
    if (existing?.status === 'active') return json(409, { error: 'You already have an account. Please sign in.' })
    if (existing && existing.status !== 'pending') return json(403, { error: 'This account has been disabled.' })

    // GETDEL is atomic: of two concurrent submits, only one gets the invite.
    if (!(await redis.getdel(key))) return INVITE_GONE()

    // Pending accounts expire with their confirmation window; activation saves without a TTL.
    await saveUser({ email, status: 'pending', provider, invitedBy: invite.invitedBy, createdAt: Date.now() }, VERIFY_TTL_SEC)
    const emailSent = await sendConfirmation(email)
    return json(200, { pending: true, email, emailSent })
  } catch (err) {
    console.error(`[register] ${err.message}`)
    return json(503, { error: 'Registration is temporarily unavailable.' })
  }
}
