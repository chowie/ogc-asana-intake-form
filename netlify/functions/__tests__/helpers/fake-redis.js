// Minimal in-memory stand-in for the @upstash/redis client, covering only the
// commands the auth code uses. TTLs read Date.now(), so vi.setSystemTime /
// vi.advanceTimersByTime drive expiry.
export function createFakeRedis() {
  const store = new Map() // key -> { value, expiresAt | null }

  const live = (key) => {
    const entry = store.get(key)
    if (!entry) return null
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key)
      return null
    }
    return entry
  }
  // Mirror @upstash/redis: strings are stored raw, everything else as JSON,
  // and every read is JSON.parse'd with a raw-string fallback. (A raw string
  // that happens to be valid JSON comes back changed — the fake must show that.)
  const serialize = (v) => (typeof v === 'string' ? v : JSON.stringify(v))
  const deserialize = (raw) => {
    if (raw === undefined || raw === null) return null
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  return {
    store,
    async get(key) {
      return deserialize(live(key)?.value)
    },
    async set(key, value, opts = {}) {
      if (opts.nx && live(key)) return null
      if (opts.xx && !live(key)) return null
      store.set(key, { value: serialize(value), expiresAt: opts.ex ? Date.now() + opts.ex * 1000 : null })
      return 'OK'
    },
    /** Single-pass SCAN: returns every live key matching a `prefix*` glob, cursor "0". */
    async scan(_cursor, opts = {}) {
      const prefix = (opts.match ?? '*').replace(/\*$/, '')
      return ['0', [...store.keys()].filter((k) => k.startsWith(prefix) && live(k))]
    },
    async getdel(key) {
      const entry = live(key)
      store.delete(key)
      return deserialize(entry?.value)
    },
    async getex(key, opts = {}) {
      const entry = live(key)
      if (!entry) return null
      if (opts.ex) entry.expiresAt = Date.now() + opts.ex * 1000
      return deserialize(entry.value)
    },
    async del(key) {
      return store.delete(key) ? 1 : 0
    },
    /** Test helper: seconds until a key expires (null = no TTL, -2 = missing). */
    ttl(key) {
      const entry = live(key)
      if (!entry) return -2
      return entry.expiresAt === null ? null : Math.round((entry.expiresAt - Date.now()) / 1000)
    },
    /** Test helper: keys matching a prefix that are still live. */
    keys(prefix) {
      return [...store.keys()].filter((k) => k.startsWith(prefix) && live(k))
    },
  }
}

/** Builds a Netlify function event. */
export function post(body, { cookie, contentType = 'application/json' } = {}) {
  return {
    httpMethod: 'POST',
    headers: { 'content-type': contentType, ...(cookie && { cookie }) },
    body: JSON.stringify(body),
  }
}

/** Extracts "ogc_session=<id>" from a Set-Cookie header, for the next request. */
export function sessionCookie(res) {
  return res.headers?.['Set-Cookie']?.split(';')[0]
}

/** Extracts the raw token from the most recent email link sent via the fetch mock. */
export function tokenFromLastEmail(fetchMock, path) {
  const calls = fetchMock.mock.calls.filter(([url]) => String(url).includes('resend.com'))
  const body = JSON.parse(calls.at(-1)[1].body)
  return new RegExp(`/${path}\\?token=([A-Za-z0-9_-]{43})`).exec(body.text)[1]
}

/** Seeds an active user (plus any extra fields) and a live session; returns the request Cookie header. */
export async function seedSession(redis, email = 'member@example.com', fields = {}, id = 'S'.repeat(43)) {
  const { hashToken } = await import('../../_shared/tokens.js')
  await redis.set(`user:${email}`, { email, status: 'active', ...fields })
  await redis.set(`sess:${hashToken(id)}`, { email }, { ex: 1800 })
  return `ogc_session=${id}`
}
