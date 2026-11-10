import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeRedis, seedSession } from './helpers/fake-redis.js'

const fake = vi.hoisted(() => ({ redis: null }))
vi.mock('../_shared/redis.js', () => ({ getRedis: () => fake.redis }))

import { handler } from '../list-users.js'

const INVITER = 'deacon@example.com'
const get = (cookie) => handler({ httpMethod: 'GET', headers: cookie ? { cookie } : {} })

beforeEach(() => {
  fake.redis = createFakeRedis()
  process.env.INVITER_EMAILS = INVITER
})

describe('list-users', () => {
  it('requires a session (401)', async () => {
    expect((await get()).statusCode).toBe(401)
  })

  it('is inviter-only (403)', async () => {
    const cookie = await seedSession(fake.redis, 'member@example.com')
    expect((await get(cookie)).statusCode).toBe(403)
  })

  it('lists every account with invite, acceptance, and last-login dates (null = never)', async () => {
    const cookie = await seedSession(fake.redis, INVITER, { firstName: 'Dana', lastName: 'Deacon', acceptedAt: 5, lastLoginAt: 9 })
    await fake.redis.set('user:invited@example.com', {
      email: 'invited@example.com', status: 'invited', firstName: 'Ivy', lastName: 'Invited',
      invitedBy: INVITER, invitedByName: 'Dana Deacon', invitedAt: 100,
    })
    await fake.redis.set('user:pending@example.com', {
      email: 'pending@example.com', status: 'pending', firstName: 'Pat', lastName: 'Pending', invitedBy: INVITER, invitedAt: 200,
    })
    // An account from before names and these timestamps existed.
    await fake.redis.set('user:legacy@example.com', {
      email: 'legacy@example.com', status: 'active', invitedBy: INVITER, createdAt: 50, verifiedAt: 60,
    })
    await fake.redis.set('user:boot@example.com', { email: 'boot@example.com', status: 'active', provider: 'email', createdAt: 40 })
    await fake.redis.set('sess:abc', { email: INVITER }) // non-user keys are ignored

    const res = await get(cookie)
    expect(res.statusCode).toBe(200)
    const { users } = JSON.parse(res.body)
    expect(users.map((u) => u.email)).toEqual([
      'boot@example.com', 'deacon@example.com', 'invited@example.com', 'legacy@example.com', 'pending@example.com',
    ]) // sorted by display name: boot@…, Dana, Ivy, legacy@…, Pat
    const by = Object.fromEntries(users.map((u) => [u.email, u]))
    expect(by['invited@example.com']).toEqual({
      email: 'invited@example.com', name: 'Ivy Invited', status: 'invited',
      invitedBy: 'Dana Deacon', invitedAt: 100, acceptedAt: null, lastLoginAt: null,
    })
    expect(by['pending@example.com']).toMatchObject({ acceptedAt: null, lastLoginAt: null })
    expect(by['legacy@example.com']).toMatchObject({ name: 'legacy@example.com', invitedAt: 50, acceptedAt: 60, lastLoginAt: null })
    expect(by['boot@example.com']).toMatchObject({ invitedAt: null, acceptedAt: 40 }) // legacy bootstrapped inviter
    expect(by[INVITER]).toMatchObject({ invitedAt: null, acceptedAt: 5, lastLoginAt: 9 })
  })
})
