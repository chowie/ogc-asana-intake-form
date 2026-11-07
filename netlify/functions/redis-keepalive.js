import { getRedis } from './_shared/redis.js'

// Scheduled daily (see netlify.toml). Upstash archives free-tier databases
// after 14 days without activity, and auth fails closed without Redis, so a
// quiet stretch would lock everyone out. One write a day keeps it active.
// Scheduled functions run only on the published (production) deploy.
export async function handler() {
  const redis = getRedis()
  if (!redis) {
    console.error('redis-keepalive: UPSTASH_* env is not set')
    return { statusCode: 500, body: 'Redis not configured' }
  }
  try {
    await redis.set('keepalive:last', new Date().toISOString())
    return { statusCode: 200, body: 'ok' }
  } catch (err) {
    console.error('redis-keepalive: write failed', err)
    return { statusCode: 500, body: 'Redis write failed' }
  }
}
