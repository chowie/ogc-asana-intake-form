import { getRedis } from './redis.js'
import { hashToken, newToken } from './tokens.js'
import { confirmEmail, sendEmail } from './email.js'
import { appUrl } from './http.js'

export const VERIFY_TTL_SEC = 24 * 60 * 60

/** Issues a confirmation token and emails it. Returns true if the email was sent. */
export async function sendConfirmation(email) {
  const token = newToken()
  await getRedis().set(`verify:${hashToken(token)}`, { email }, { ex: VERIFY_TTL_SEC })
  try {
    await sendEmail(confirmEmail({ to: email, link: `${appUrl()}/verify?token=${token}` }))
    return true
  } catch (err) {
    console.error(`[verification] confirmation email failed: ${err.message}`)
    return false
  }
}

