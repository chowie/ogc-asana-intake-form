import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeRedis, post, seedSession, sessionCookie, tokenFromLastEmail } from './helpers/fake-redis.js'

const fake = vi.hoisted(() => ({ redis: null }))
vi.mock('../_shared/redis.js', () => ({ getRedis: () => fake.redis }))
vi.mock('../_shared/rate-limit.js', () => ({ limit: async () => null }))

import { handler as changeEmail } from '../change-email.js'
import { handler as session } from '../session.js'
import { requireSession } from '../_shared/session.js'

const OLD = 'member@example.com'
const NEW = 'preferred@example.com'
const INVITER = 'deacon@example.com'
let fetchMock
let cookie

beforeEach(async () => {
  fake.redis = createFakeRedis()
  process.env.INVITER_EMAILS = INVITER
  process.env.RESEND_API_KEY = 're_test'
  process.env.EMAIL_FROM = 'OGC <noreply@example.com>'
  process.env.URL = 'https://ogc.example.com'
  fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })
  vi.stubGlobal('fetch', fetchMock)
  cookie = await seedSession(fake.redis, OLD, { firstName: 'Mary', lastName: 'Member', provider: 'email', profileConfirmedAt: 1, createdAt: 1000 })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const json = (res) => JSON.parse(res.body)
const lastEmail = () => JSON.parse(fetchMock.mock.calls.at(-1)[1].body)
const request = (newEmail = NEW, c = cookie) => changeEmail(post({ newEmail }, { cookie: c }))
const confirm = (token) => changeEmail(post({ token }))

describe('change-email request', () => {
  it('requires a session (401)', async () => {
    expect((await changeEmail(post({ newEmail: NEW }))).statusCode).toBe(401)
  })

  it('emails the confirmation to the OLD address only — never the new one', async () => {
    const res = await request()
    expect(res.statusCode).toBe(200)
    expect(json(res)).toEqual({ sent: true, to: OLD })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const sent = lastEmail()
    expect(sent.to).toEqual([OLD])
    expect(sent.text).toContain(NEW)
    expect(sent.text).toMatch(/https:\/\/ogc\.example\.com\/email-change\?token=/)
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(`"to":["${NEW}"]`)
  })

  it('does not change anything until the link is confirmed', async () => {
    await request()
    expect(await fake.redis.get(`user:${OLD}`)).toMatchObject({ email: OLD })
    expect(await fake.redis.get(`user:${NEW}`)).toBeNull()
  })

  it('is blocked for accounts that sign in with Google (403)', async () => {
    const c = await seedSession(fake.redis, 'g@example.com', { provider: 'google' }, 'G'.repeat(43))
    expect((await request(NEW, c)).statusCode).toBe(403)
    const c2 = await seedSession(fake.redis, 'g2@example.com', { provider: 'email', lastLoginMethod: 'google' }, 'H'.repeat(43))
    expect((await request(NEW, c2)).statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is blocked for inviters (403)', async () => {
    const c = await seedSession(fake.redis, INVITER, { provider: 'email' }, 'I'.repeat(43))
    const res = await request(NEW, c)
    expect(res.statusCode).toBe(403)
    expect(json(res).error).toMatch(/configuration/)
  })

  it('rejects an address that already has an account, even an invited one (409)', async () => {
    await fake.redis.set(`user:${NEW}`, { email: NEW, status: 'invited' })
    expect((await request()).statusCode).toBe(409)
  })

  it('rejects taking over an inviter address (409)', async () => {
    expect((await request(INVITER)).statusCode).toBe(409)
  })

  it('rejects an invalid or unchanged address (422)', async () => {
    expect((await request('not-an-email')).statusCode).toBe(422)
    expect((await request(` ${OLD.toUpperCase()} `)).statusCode).toBe(422)
  })
})

describe('change-email confirm', () => {
  async function requestToken() {
    await request()
    return tokenFromLastEmail(fetchMock, 'email-change')
  }

  /** Approves from the old inbox; returns the verify token emailed to the new address. */
  async function approve(token) {
    const res = await confirm(token ?? (await requestToken()))
    expect(res.statusCode).toBe(200)
    return tokenFromLastEmail(fetchMock, 'email-change-verify')
  }

  it('approval from the old inbox sends a verify link to the NEW address, without moving anything yet', async () => {
    const res = await confirm(await requestToken())
    expect(json(res)).toEqual({ approved: true, sentTo: NEW })
    expect(res.headers['Set-Cookie']).toBeUndefined()
    const sent = lastEmail()
    expect(sent.to).toEqual([NEW])
    expect(sent.text).toMatch(/https:\/\/ogc\.example\.com\/email-change-verify\?token=/)
    expect(await fake.redis.get(`user:${OLD}`)).not.toBeNull()
    expect(await fake.redis.get(`user:${NEW}`)).toBeNull()
  })

  it('the verify link expires after 1 hour, leaving the account where it was', async () => {
    vi.useFakeTimers()
    const verify = await approve()
    vi.advanceTimersByTime(60 * 60_000 + 1000)
    expect((await confirm(verify)).statusCode).toBe(410)
    expect(await fake.redis.get(`user:${OLD}`)).not.toBeNull()
  })

  it('after both links: moves the account, ends old sessions, and signs in as the new address', async () => {
    const res = await confirm(await approve())
    expect(res.statusCode).toBe(200)
    expect(json(res)).toMatchObject({ authenticated: true, email: NEW, name: 'Mary Member', needsProfile: false })

    expect(await fake.redis.get(`user:${OLD}`)).toBeNull()
    expect(await fake.redis.get(`user:${NEW}`)).toMatchObject({ email: NEW, firstName: 'Mary', previousEmail: OLD, status: 'active' })

    expect((await requireSession({ headers: { cookie } })).error.statusCode).toBe(401)
    const fresh = sessionCookie(res)
    expect(json(await session({ httpMethod: 'GET', headers: { cookie: fresh } })).email).toBe(NEW)
  })

  it('both links are one-time use (410)', async () => {
    const token = await requestToken()
    const verify = await approve(token)
    expect((await confirm(token)).statusCode).toBe(410)
    expect((await confirm(verify)).statusCode).toBe(200)
    expect((await confirm(verify)).statusCode).toBe(410)
  })

  it('expires after 1 hour (410)', async () => {
    vi.useFakeTimers()
    const token = await requestToken()
    vi.advanceTimersByTime(60 * 60_000 + 1000)
    expect((await confirm(token)).statusCode).toBe(410)
    expect(await fake.redis.get(`user:${OLD}`)).not.toBeNull()
  })

  it('refuses if the new address was claimed after the request (409), leaving the account intact', async () => {
    const token = await approve()
    await fake.redis.set(`user:${NEW}`, { email: NEW, status: 'active', firstName: 'Someone' })
    expect((await confirm(token)).statusCode).toBe(409)
    expect((await fake.redis.get(`user:${NEW}`)).firstName).toBe('Someone')
    expect(await fake.redis.get(`user:${OLD}`)).not.toBeNull()
  })

  it('refuses if the account was disabled after the request (410)', async () => {
    const token = await approve()
    const user = await fake.redis.get(`user:${OLD}`)
    await fake.redis.set(`user:${OLD}`, { ...user, status: 'disabled' })
    expect((await confirm(token)).statusCode).toBe(410)
    expect(await fake.redis.get(`user:${NEW}`)).toBeNull()
  })

  it('rejects a garbage token (410)', async () => {
    expect((await confirm('nope')).statusCode).toBe(410)
  })

  it('a leftover link is dead if the old address was re-created for someone else', async () => {
    const token = await approve()
    await fake.redis.set(`user:${OLD}`, { email: OLD, status: 'active', provider: 'email', createdAt: 2000, firstName: 'Other' })
    expect((await confirm(token)).statusCode).toBe(410)
    expect((await fake.redis.get(`user:${OLD}`)).firstName).toBe('Other')
    expect(await fake.redis.get(`user:${NEW}`)).toBeNull()
  })

  it('two links redeemed at once cannot clone the account', async () => {
    await request(NEW)
    const a = await approve(tokenFromLastEmail(fetchMock, 'email-change'))
    await request('second@example.com')
    const b = await approve(tokenFromLastEmail(fetchMock, 'email-change'))
    const results = await Promise.all([confirm(a), confirm(b)])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 410])
    const active = fake.redis.keys('user:')
    expect(active).toHaveLength(1)
  })

  it('an old-address session stays dead even after the address is re-created and activated', async () => {
    await confirm(await approve())
    expect((await requireSession({ headers: { cookie } })).error.statusCode).toBe(401)
    // Someone new is later given the old address.
    await fake.redis.set(`user:${OLD}`, { email: OLD, status: 'active', createdAt: 3000 })
    expect((await requireSession({ headers: { cookie } })).error.statusCode).toBe(401)
  })

  it('a sign-in racing the move does not resurrect the old record', async () => {
    const { updateUser } = await import('../_shared/users.js')
    await confirm(await approve())
    expect(await updateUser(OLD, { lastLoginAt: 5 })).toBeNull()
    expect(await fake.redis.get(`user:${OLD}`)).toBeNull()
  })
})
