import { requireSession } from './_shared/session.js'
import { displayName, isInviter, listUsers } from './_shared/users.js'
import { json } from './_shared/http.js'

// GET — inviter-only directory for the Users tray: everyone invited, pending,
// active, or disabled, with invite / acceptance / last-login timestamps.
export async function handler(event) {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }

  const session = await requireSession(event)
  if (session.error) return session.error
  if (!isInviter(session.email)) return json(403, { error: 'Only designated members can view users.' })

  try {
    const users = (await listUsers())
      .map((u) => ({
        email: u.email,
        name: displayName(u),
        status: u.status,
        invitedBy: u.invitedByName ?? u.invitedBy ?? null,
        invitedAt: u.invitedAt ?? (u.invitedBy ? u.createdAt ?? null : null),
        // Older accounts recorded activation as verifiedAt; bootstrapped
        // inviters from before this field existed were active from creation.
        acceptedAt: u.acceptedAt ?? u.verifiedAt ?? (u.status === 'active' ? u.createdAt ?? null : null),
        lastLoginAt: u.lastLoginAt ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return json(200, { users })
  } catch (err) {
    console.error(`[list-users] ${err.message}`)
    return json(503, { error: 'The user list is temporarily unavailable.' })
  }
}
