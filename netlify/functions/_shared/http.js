/** JSON response helper shared by the auth functions. */
export function json(statusCode, data, headers = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  }
}

/** 415 response unless the request declares application/json, else null. */
export function requireJsonContentType(event) {
  const ct = event.headers?.['content-type'] ?? event.headers?.['Content-Type'] ?? ''
  return ct.toLowerCase().startsWith('application/json') ? null : json(415, { error: 'Content-Type must be application/json' })
}

/**
 * Parses a JSON POST body. Returns { body } or { error: response }.
 * Requiring application/json forces a CORS preflight on cross-origin
 * requests, which (with SameSite=Strict cookies) blocks CSRF.
 */
export function parseJsonPost(event) {
  if (event.httpMethod !== 'POST') return { error: { statusCode: 405, body: 'Method Not Allowed' } }
  const badType = requireJsonContentType(event)
  if (badType) return { error: badType }
  try {
    return { body: JSON.parse(event.body ?? '{}') ?? {} }
  } catch {
    return { error: json(400, { error: 'Invalid JSON' }) }
  }
}

/**
 * Absolute base URL for emailed links — never derived from the Host header.
 * APP_URL overrides (e.g. set it in the deploy-preview context, since
 * Netlify's URL always points at production); then Netlify's URL; then local.
 */
export function appUrl() {
  return (process.env.APP_URL || process.env.URL || 'http://localhost:8888').replace(/\/$/, '')
}
