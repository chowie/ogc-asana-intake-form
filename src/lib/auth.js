const AUTH_KEY = 'ogc_auth'

/** Reads the stored auth record, or null if absent/corrupt. */
function read() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null')
  } catch {
    return null
  }
}

/** Persists the signed session token and its expiry. */
export function setAuth({ token, expiresAt }) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ token, expiresAt }))
}

/** Returns the signed token sent to protected functions, or '' if none. */
export function getAuthToken() {
  return read()?.token ?? ''
}

/** True when a non-expired token is stored. */
export function isAuthValid() {
  const stored = read()
  return !!stored?.token && stored.expiresAt > Date.now()
}

/** Clears stored auth. */
export function clearAuth() {
  localStorage.removeItem(AUTH_KEY)
}
