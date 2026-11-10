import { getSession } from './_shared/session.js'
import { getUser, sessionPayload } from './_shared/users.js'
import { json } from './_shared/http.js'

// GET — tells the client who is signed in (the HttpOnly cookie is invisible
// to JS). Counts as activity, so it also slides the 30-minute window.
export async function handler(event) {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }
  const { email } = await getSession(event)
  if (!email) return json(200, { authenticated: false })
  try {
    const user = await getUser(email)
    if (!user) return json(200, { authenticated: false })
    return json(200, sessionPayload(user))
  } catch (err) {
    console.error(`[session] ${err.message}`)
    return json(200, { authenticated: false })
  }
}
