// Thin wrappers over the auth functions. The session lives in an HttpOnly
// cookie the browser sends automatically — nothing is stored in JS.

/** Error carrying the HTTP status, so callers can spot 401 (session expired). */
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function call(name, { method = 'POST', body } = {}) {
  let res
  try {
    res = await fetch(`/.netlify/functions/${name}`, {
      method,
      ...(method === 'POST' && {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      }),
    })
  } catch {
    throw new ApiError("We couldn't reach the server. Check your connection and try again.", 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? 'Something went wrong. Please try again.', res.status)
  return data
}

/** { authenticated, email?, canInvite? } — also counts as activity for the 30-min window. */
export const getSession = () => call('session', { method: 'GET' })
export const logout = () => call('logout')

export const requestLoginLink = (email) => call('login', { body: { email } })
export const redeemLoginLink = (loginToken) => call('login', { body: { loginToken } })
export const signInWithGoogle = (googleCredential) => call('login', { body: { googleCredential } })

export const registerWithEmail = (inviteToken, email) => call('register', { body: { inviteToken, email } })
export const registerWithGoogle = (inviteToken, googleCredential) =>
  call('register', { body: { inviteToken, googleCredential } })

export const confirmEmail = (token) => call('verify-email', { body: { token } })
export const resendConfirmation = (email) => call('verify-email', { body: { resend: email } })

export const createInvite = (email, sendEmail) => call('create-invite', { body: { email, sendEmail } })

const ROUTES = { '/invite': 'invite', '/verify': 'verify', '/login': 'login' }

/** Reads a token-bearing route (/invite, /verify, /login) from the URL, or null. */
export function parseAuthRoute(loc = window.location) {
  const kind = ROUTES[loc.pathname.replace(/\/$/, '')]
  const token = new URLSearchParams(loc.search).get('token')
  return kind && token ? { kind, token } : null
}
