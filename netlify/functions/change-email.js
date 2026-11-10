import { getRedis } from './_shared/redis.js'
import { requireSession, signedInResponse } from './_shared/session.js'
import { canChangeEmail, getUser, isInviter, isValidEmail, normalizeEmail } from './_shared/users.js'
import { hashToken, isTokenShape, newToken } from './_shared/tokens.js'
import { emailChangeEmail, newAddressEmail, sendEmail } from './_shared/email.js'
import { appUrl, json, parseJsonPost } from './_shared/http.js'
import { limit } from './_shared/rate-limit.js'

export const EMAIL_CHANGE_TTL_SEC = 60 * 60

// Reasons a new address can't be used. Checked at request time and again at
// confirm time, since things may change during the hour in between.
async function newEmailProblem(newEmail, oldEmail) {
  if (!isValidEmail(newEmail)) return json(422, { error: 'Please enter a valid email address.' })
  if (newEmail === oldEmail) return json(422, { error: 'That is already your sign-in email.' })
  // INVITER_EMAILS grants invite rights by address — taking one over would be privilege escalation.
  if (isInviter(newEmail) || (await getUser(newEmail))) {
    return json(409, { error: 'That email address is already in use. Choose a different one.' })
  }
  return null
}

// Two one-time links, each 1 hour, and the account moves only after both:
// POST { newEmail } — signed in: email an APPROVAL link to the CURRENT (old)
//                     address — the change must be approved by whoever
//                     controls the account's inbox.
// POST { token }    — stage "approve" (old inbox): email a VERIFY link to the
//                     new address, proving it exists and belongs to them.
//                     stage "verify" (new inbox): move the account and sign in
//                     as the new address.
async function issueToken(redis, payload) {
  const token = newToken()
  await redis.set(`emailchange:${hashToken(token)}`, payload, { ex: EMAIL_CHANGE_TTL_SEC })
  return token
}

export async function handler(event) {
  const { body, error } = parseJsonPost(event)
  if (error) return error

  try {
    if (body.token !== undefined) {
      const limited = await limit(event, { id: 'change-email-confirm', max: 10, windowSec: 60 })
      if (limited) return limited
      const gone = json(410, { error: 'This confirmation link has expired or was already used.' })
      if (!isTokenShape(body.token)) return gone
      const redis = getRedis()
      const pending = await redis.getdel(`emailchange:${hashToken(body.token)}`)
      if (!pending?.oldEmail || !pending?.newEmail) return gone

      const user = await getUser(pending.oldEmail)
      if (user?.status !== 'active' || !canChangeEmail(user)) return gone
      // The token belongs to the account that asked, not just its address: if the
      // address was deleted and re-created for someone else, the old link is dead.
      if ((user.createdAt ?? null) !== (pending.createdAt ?? null)) return gone
      const problem = await newEmailProblem(pending.newEmail, pending.oldEmail)
      if (problem) return problem

      if (pending.stage !== 'verify') {
        // Approved from the old inbox. Now prove the new address is theirs.
        const { oldEmail, newEmail, createdAt } = pending
        const token = await issueToken(redis, { oldEmail, newEmail, createdAt, stage: 'verify' })
        try {
          await sendEmail(newAddressEmail({ to: newEmail, link: `${appUrl()}/email-change-verify?token=${token}` }))
        } catch (err) {
          console.error(`[change-email] verify email failed: ${err.message}`)
          return json(502, { error: "Approved, but we couldn't email your new address. Please start the change again." })
        }
        return json(200, { approved: true, sentTo: newEmail })
      }

      // Verified from the new inbox. One move per account at a time (two links
      // redeemed at once can't clone it).
      if (!(await redis.set(`lock:emailchange:${pending.oldEmail}`, 1, { nx: true, ex: 30 }))) return gone

      // NX: if someone claimed the address in the meantime, don't overwrite them.
      const moved = { ...user, email: pending.newEmail, previousEmail: pending.oldEmail, emailChangedAt: Date.now() }
      if (!(await redis.set(`user:${pending.newEmail}`, moved, { nx: true }))) {
        await redis.del(`lock:emailchange:${pending.oldEmail}`)
        return json(409, { error: 'That email address is already in use. Choose a different one.' })
      }
      // Deleting the old record also ends every session still pointing at it
      // (getSession deletes them on their next use). The lock is left to expire,
      // so any other outstanding link for the old address fails in the meantime
      // — and after that, the old record is gone.
      await redis.del(`user:${pending.oldEmail}`)
      return await signedInResponse(pending.newEmail, 'email')
    }

    const session = await requireSession(event)
    if (session.error) return session.error

    const limited = await limit(event, { id: 'change-email-request', max: 5, windowSec: 3600 })
    if (limited) return limited

    const user = await getUser(session.email)
    if (!canChangeEmail(user)) {
      return json(403, {
        error: isInviter(session.email)
          ? 'Inviter email addresses are set in the site configuration and can’t be changed here.'
          : 'Accounts that sign in with Google use their Google email address.',
      })
    }

    const newEmail = normalizeEmail(body.newEmail)
    const problem = await newEmailProblem(newEmail, session.email)
    if (problem) return problem

    const token = await issueToken(getRedis(), { oldEmail: session.email, newEmail, createdAt: user.createdAt ?? null, stage: 'approve' })
    const link = `${appUrl()}/email-change?token=${token}`
    try {
      await sendEmail(emailChangeEmail({ to: session.email, newEmail, link }))
    } catch (err) {
      console.error(`[change-email] email failed: ${err.message}`)
      return json(502, { error: "We couldn't send the confirmation email. Please try again." })
    }
    return json(200, { sent: true, to: session.email })
  } catch (err) {
    console.error(`[change-email] ${err.message}`)
    return json(503, { error: 'Changing your email is temporarily unavailable.' })
  }
}
