import { getRedis } from './_shared/redis.js'
import { requireSession } from './_shared/session.js'
import { displayName, getUser, isInviter, isValidEmail, normalizeEmail, sanitizeName } from './_shared/users.js'
import { hashToken, newToken } from './_shared/tokens.js'
import { inviteEmail, sendEmail } from './_shared/email.js'
import { appUrl, json, parseJsonPost } from './_shared/http.js'
import { limit } from './_shared/rate-limit.js'

export const INVITE_TTL_SEC = 48 * 60 * 60

export async function handler(event) {
  const { body, error } = parseJsonPost(event)
  if (error) return error

  const session = await requireSession(event)
  if (session.error) return session.error
  if (!isInviter(session.email)) return json(403, { error: 'Only designated members can send invites.' })

  const limited = await limit(event, { id: 'create-invite', max: 20, windowSec: 3600 })
  if (limited) return limited

  const firstName = sanitizeName(body.firstName)
  const lastName = sanitizeName(body.lastName)
  if (!firstName || !lastName) return json(422, { error: "Please enter the person's first and last name." })
  const email = normalizeEmail(body.email)
  if (!isValidEmail(email)) return json(422, { error: 'Please enter a valid email address.' })

  try {
    const existing = await getUser(email)
    if (existing?.status === 'active') return json(409, { error: 'That person already has an account.' })
    // A disabled account is only restored deliberately (status back to "active"), never by re-inviting.
    if (existing && !['invited', 'pending'].includes(existing.status)) return json(409, { error: 'That account is disabled.' })

    const inviter = await getUser(session.email)
    const inviterName = displayName(inviter) || session.email
    const now = Date.now()
    const token = newToken()
    const expiresAt = now + INVITE_TTL_SEC * 1000
    await getRedis().set(
      `invite:${hashToken(token)}`,
      { email, firstName, lastName, invitedBy: session.email, invitedByName: inviterName, createdAt: now },
      { ex: INVITE_TTL_SEC },
    )
    // A durable record from invite time, so the Users tray shows invites that
    // were never accepted. Re-inviting refreshes the names and invite date.
    const record = {
      ...existing,
      email,
      firstName,
      lastName,
      status: existing?.status ?? 'invited',
      invitedBy: session.email,
      invitedByName: inviterName,
      invitedAt: now,
      createdAt: existing?.createdAt ?? now,
    }
    // NX when there was no record, so a just-created account is never overwritten.
    const wrote = await getRedis().set(`user:${email}`, record, existing ? {} : { nx: true })
    if (!wrote) return json(409, { error: 'That person already has an account.' })
    const link = `${appUrl()}/invite?token=${token}`

    let emailSent = false
    if (body.sendEmail !== false) {
      try {
        await sendEmail(inviteEmail({ to: email, firstName, link, inviterName, inviterEmail: session.email }))
        emailSent = true
      } catch (err) {
        console.error(`[create-invite] email failed: ${err.message}`)
      }
    }

    return json(200, { link, expiresAt, emailSent })
  } catch (err) {
    console.error(`[create-invite] ${err.message}`)
    return json(503, { error: 'Invites are temporarily unavailable.' })
  }
}
