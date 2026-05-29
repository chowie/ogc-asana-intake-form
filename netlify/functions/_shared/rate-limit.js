import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

let redis = null
function getRedis() {
  if (redis) return redis
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) return null
  redis = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN })
  return redis
}

const limiters = new Map()
function getLimiter(id, max, windowSec) {
  const key = `${id}:${max}:${windowSec}`
  if (limiters.has(key)) return limiters.get(key)
  const client = getRedis()
  if (!client) return null
  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
    prefix: `rl:${id}`,
  })
  limiters.set(key, limiter)
  return limiter
}

function clientIp(event) {
  return (
    event.headers?.['x-nf-client-connection-ip'] ||
    event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    'unknown'
  )
}

/**
 * Per-IP rate limit. Returns a 429 response object when the caller is over
 * the limit, or null otherwise. Fails open (returns null) when Upstash env
 * is unset so local `netlify dev` works without Redis.
 */
export async function limit(event, { id, max, windowSec }) {
  const limiter = getLimiter(id, max, windowSec)
  if (!limiter) {
    console.warn(`[rate-limit] Upstash not configured — skipping limit for "${id}"`)
    return null
  }

  try {
    const { success } = await limiter.limit(clientIp(event))
    if (success) return null
  } catch (err) {
    console.warn(`[rate-limit] limiter error for "${id}": ${err.message} — allowing`)
    return null
  }

  return {
    statusCode: 429,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
  }
}
