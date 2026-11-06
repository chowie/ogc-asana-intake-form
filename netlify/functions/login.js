import { getRedis } from './_shared/redis.js'
import { createSession } from './_shared/session.js'
import { canSignIn, isInviter, isValidEmail, normalizeEmail } from './_shared/users.js'
import { hashToken, isTokenShape, newToken } from './_shared/tokens.js'
import { loginEmail, sendEmail } from './_shared/email.js'
import { verifyGoogleIdToken } from './_shared/google.js'
import { appUrl, json, parseJsonPost } from './_shared/http.js'
import { limit } from './_shared/rate-limit.js'
import { padTo, RESPONSE_FLOOR_MS } from './_shared/timing.js'

export const LOGIN_TTL_SEC = 15 * 60

async function startSession(email) {
  const setCookie = await createSession(email)
  return json(200, { authenticated: true, email, canInvite: isInviter(email) }, { 'Set-Cookie': setCookie })
}

// POST { email }            — email a one-time sign-in link
// POST { loginToken }       — redeem a sign-in link
// POST { googleCredential } — sign in with Google
export async function handler(event) {
  const { body, error } = parseJsonPost(event)
  if (error) return error

  try {
    if (body.loginToken !== undefined) {
      const limited = await limit(event, { id: 'login-redeem', max: 10, windowSec: 60 })
      if (limited) return limited
      const gone = json(410, { error: 'This sign-in link has expired or was already used.' })
      if (!isTokenShape(body.loginToken)) return gone
      const email = (await getRedis().getdel(`login:${hashToken(body.loginToken)}`))?.email
      if (!email || !(await canSignIn(email))) return gone
      return await startSession(email)
    }

    if (body.googleCredential !== undefined) {
      const limited = await limit(event, { id: 'login-google', max: 10, windowSec: 60 })
      if (limited) return limited
      const email = await verifyGoogleIdToken(body.googleCredential)
      if (!email) return json(401, { error: "We couldn't verify your Google account. Please try again." })
      if (!(await canSignIn(email))) {
        return json(403, { error: 'No active account uses that Google email. Ask a deacon for an invite, or confirm your email first.' })
      }
      return await startSession(email)
    }

    const limited = await limit(event, { id: 'login-request', max: 5, windowSec: 600 })
    if (limited) return limited
    const email = normalizeEmail(body.email)
    if (!isValidEmail(email)) return json(422, { error: 'Please enter a valid email address.' })

    const started = Date.now()
    if (await canSignIn(email)) {
      const token = newToken()
      await getRedis().set(`login:${hashToken(token)}`, { email }, { ex: LOGIN_TTL_SEC })
      try {
        await sendEmail(loginEmail({ to: email, link: `${appUrl()}/login?token=${token}` }))
      } catch (err) {
        console.error(`[login] email failed: ${err.message}`)
      }
    }
    // Identical response — and a timing floor — whether or not the account
    // exists, so neither the body nor the latency reveals who has an account.
    await padTo(started, RESPONSE_FLOOR_MS)
    return json(200, { sent: true })
  } catch (err) {
    console.error(`[login] ${err.message}`)
    return json(503, { error: 'Sign-in is temporarily unavailable.' })
  }
}
