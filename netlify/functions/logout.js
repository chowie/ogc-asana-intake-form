import { destroySession } from './_shared/session.js'
import { json, parseJsonPost } from './_shared/http.js'

export async function handler(event) {
  const { error } = parseJsonPost(event)
  if (error) return error
  let setCookie
  try {
    setCookie = await destroySession(event)
  } catch (err) {
    console.error(`[logout] ${err.message}`)
    return json(503, { error: 'Sign-out is temporarily unavailable.' })
  }
  return json(200, { ok: true }, { 'Set-Cookie': setCookie })
}
