import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeRedis } from './helpers/fake-redis.js'

const fake = vi.hoisted(() => ({ redis: null }))
vi.mock('../_shared/redis.js', () => ({ getRedis: () => fake.redis }))

import { handler } from '../redis-keepalive.js'

describe('redis-keepalive', () => {
  beforeEach(() => {
    fake.redis = createFakeRedis()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('writes a timestamp with no TTL', async () => {
    const res = await handler()
    expect(res.statusCode).toBe(200)
    expect(await fake.redis.get('keepalive:last')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns 500 when Redis is not configured', async () => {
    fake.redis = null
    expect((await handler()).statusCode).toBe(500)
  })

  it('returns 500 when the write fails', async () => {
    fake.redis = { set: async () => { throw new Error('down') } }
    expect((await handler()).statusCode).toBe(500)
  })
})
