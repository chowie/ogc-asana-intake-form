import { getRedis } from './_shared/redis.js'
import { createSession } from './_shared/session.js'
import { getUser, isInviter, normalizeEmail, saveUser } from './_shared/users.js'
import { hashToken, isTokenShape } from './_shared/tokens.js'
import { sendConfirmation } from './_shared/verification.js'
import { json, parseJsonPost } from './_shared/http.js'
import { limit } from './_shared/rate-limit.js'
import { padTo, RESPONSE_FLOOR_MS } from './_shared/timing.js'

// POST { token } — confirm an email and start a session.
// POST { resend: email } — re-send the confirmation for a pending account.
export async function handler(event) {
  const { body, error } = parseJsonPost(event)
  if (error) return error

  try {
    if (body.resend !== undefined) {
      const limited = await limit(event, { id: 'resend-verify', max: 3, windowSec: 600 })
      if (limited) return limited
      const started = Date.now()
      const email = normalizeEmail(body.resend)
      const user = email ? await getUser(email) : null
      if (user?.status === 'pending') await sendConfirmation(email)
      // Identical response (and timing floor) either way, so this can't probe for accounts.
      await padTo(started, RESPONSE_FLOOR_MS)
      return json(200, { ok: true })
    }

    const limited = await limit(event, { id: 'verify-email', max: 10, windowSec: 60 })
    if (limited) return limited

    const gone = json(410, { error: 'This confirmation link has expired or was already used.' })
    if (!isTokenShape(body.token)) return gone
    const email = (await getRedis().getdel(`verify:${hashToken(body.token)}`))?.email
    if (!email) return gone

    const user = await getUser(email)
    // Only a pending account can be activated; a disabled one stays disabled.
    if (user?.status === 'pending') await saveUser({ ...user, status: 'active', verifiedAt: Date.now() })
    else if (user?.status !== 'active') return gone

    const setCookie = await createSession(email)
    return json(200, { authenticated: true, email, canInvite: isInviter(email) }, { 'Set-Cookie': setCookie })
  } catch (err) {
    console.error(`[verify-email] ${err.message}`)
    return json(503, { error: 'Email confirmation is temporarily unavailable.' })
  }
}
