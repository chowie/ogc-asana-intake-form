import { requireSession } from './_shared/session.js'
import { sanitizeName, sessionPayload, updateUser } from './_shared/users.js'
import { json, parseJsonPost } from './_shared/http.js'
import { limit } from './_shared/rate-limit.js'

// POST { firstName, lastName } — the signed-in user reviews or corrects their
// name (first-login onboarding, or later via "Profile"). Returns the session payload.
export async function handler(event) {
  const { body, error } = parseJsonPost(event)
  if (error) return error

  const session = await requireSession(event)
  if (session.error) return session.error

  const limited = await limit(event, { id: 'profile', max: 20, windowSec: 600 })
  if (limited) return limited

  const firstName = sanitizeName(body.firstName)
  const lastName = sanitizeName(body.lastName)
  if (!firstName || !lastName) return json(422, { error: 'Please enter your first and last name.' })

  try {
    const user = await updateUser(session.email, { firstName, lastName, profileConfirmedAt: Date.now() })
    if (!user) return json(401, { error: 'Your session has expired. Please sign in again.' })
    return json(200, sessionPayload(user))
  } catch (err) {
    console.error(`[profile] ${err.message}`)
    return json(503, { error: 'Saving your profile is temporarily unavailable.' })
  }
}
