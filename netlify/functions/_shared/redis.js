import { Redis } from '@upstash/redis'

let redis = null

/**
 * Shared Upstash client, or null when UPSTASH_* env is unset.
 * Rate limiting treats null as "skip" (fail open); auth treats it as
 * "deny" (fail closed).
 */
export function getRedis() {
  if (redis) return redis
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) return null
  redis = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN })
  return redis
}
