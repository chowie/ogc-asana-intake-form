import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeRedis, post, sessionCookie, tokenFromLastEmail } from './helpers/fake-redis.js'

const fake = vi.hoisted(() => {
  process.env.AUTH_RESPONSE_FLOOR_MS = '0' // timing floor tested separately
  return { redis: null }
})
vi.mock('../_shared/redis.js', () => ({ getRedis: () => fake.redis }))
vi.mock('../_shared/rate-limit.js', () => ({ limit: async () => null }))
vi.mock('../_shared/google.js', () => ({
  // "google:<email>" stands in for a verified ID token; anything else is invalid.
  verifyGoogleIdToken: async (c) => (typeof c === 'string' && c.startsWith('google:') ? c.slice(7) : null),
}))

import { handler as createInvite } from '../create-invite.js'
import { handler as register } from '../register.js'
import { handler as verifyEmail } from '../verify-email.js'
import { handler as login } from '../login.js'
import { handler as session } from '../session.js'
import { handler as logout } from '../logout.js'
import { handler as profile } from '../profile.js'
import { requireSession } from '../_shared/session.js'
import { hashToken } from '../_shared/tokens.js'

const INVITER = 'deacon@example.com'
const NEWBIE = 'new.member@example.com'
let fetchMock

beforeEach(() => {
  fake.redis = createFakeRedis()
  process.env.INVITER_EMAILS = `${INVITER}, other.inviter@example.com`
  process.env.RESEND_API_KEY = 're_test'
  process.env.EMAIL_FROM = 'OGC <noreply@example.com>'
  process.env.URL = 'https://ogc.example.com'
  fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const json = (res) => JSON.parse(res.body)

/** Signs the inviter in via magic link; returns their session cookie. */
async function signInInviter() {
  await login(post({ email: INVITER }))
  const res = await login(post({ loginToken: tokenFromLastEmail(fetchMock, 'login') }))
  return sessionCookie(res)
}

async function invite(cookie, email = NEWBIE, extra = {}) {
  const res = await createInvite(post({ email, firstName: 'Nora', lastName: 'Newman', ...extra }, { cookie }))
  return { res, token: res.statusCode === 200 ? new URL(json(res).link).searchParams.get('token') : null }
}

describe('create-invite', () => {
  it('requires a session (401)', async () => {
    const res = await createInvite(post({ email: NEWBIE }))
    expect(res.statusCode).toBe(401)
  })

  it('rejects a signed-in non-inviter (403)', async () => {
    const cookie = await signInInviter()
    const { token } = await invite(cookie)
    await register(post({ inviteToken: token, email: NEWBIE }))
    const v = await verifyEmail(post({ token: tokenFromLastEmail(fetchMock, 'verify') }))
    const res = await createInvite(post({ email: 'x@example.com' }, { cookie: sessionCookie(v) }))
    expect(res.statusCode).toBe(403)
  })

  it('returns a copyable link and emails it by default', async () => {
    const cookie = await signInInviter()
    const { res, token } = await invite(cookie)
    expect(res.statusCode).toBe(200)
    const data = json(res)
    expect(data.link).toBe(`https://ogc.example.com/invite?token=${token}`)
    expect(data.emailSent).toBe(true)
    expect(data.expiresAt - Date.now()).toBeGreaterThan(47.9 * 3600_000)
    const sent = JSON.parse(fetchMock.mock.calls.at(-1)[1].body)
    expect(sent.to).toEqual([NEWBIE])
    expect(sent.text).toContain(data.link)
  })

  it('skips the email when sendEmail is false (copy-link only)', async () => {
    const cookie = await signInInviter()
    const before = fetchMock.mock.calls.length
    const { res } = await invite(cookie, NEWBIE, { sendEmail: false })
    expect(json(res).emailSent).toBe(false)
    expect(fetchMock.mock.calls.length).toBe(before)
  })

  it('stores only the token hash, never the raw token', async () => {
    const cookie = await signInInviter()
    const { token } = await invite(cookie)
    expect(fake.redis.keys('invite:')).toEqual([`invite:${hashToken(token)}`])
    expect(JSON.stringify([...fake.redis.store.entries()])).not.toContain(token)
  })

  it('rejects inviting someone who already has an active account (409)', async () => {
    const cookie = await signInInviter()
    const { res } = await invite(cookie, INVITER)
    expect(res.statusCode).toBe(409)
  })

  it('rejects a malformed email (422)', async () => {
    const cookie = await signInInviter()
    const { res } = await invite(cookie, 'not-an-email')
    expect(res.statusCode).toBe(422)
  })

  it('requires a first and last name (422)', async () => {
    const cookie = await signInInviter()
    expect((await invite(cookie, NEWBIE, { firstName: '' })).res.statusCode).toBe(422)
    expect((await invite(cookie, NEWBIE, { lastName: '   ' })).res.statusCode).toBe(422)
    expect(fake.redis.keys('invite:')).toEqual([])
  })

  it("personalizes the email with the invitee's first name and the inviter's name and email", async () => {
    const cookie = await signInInviter()
    await profile(post({ firstName: 'Dana', lastName: 'Deacon' }, { cookie }))
    await invite(cookie)
    const sent = JSON.parse(fetchMock.mock.calls.at(-1)[1].body)
    expect(sent.text).toMatch(/^Hi Nora,/)
    expect(sent.text).toContain(`Dana Deacon (${INVITER})`)
    expect(sent.subject).toContain('Dana Deacon')
  })

  it('escapes names in the HTML email', async () => {
    const cookie = await signInInviter()
    await invite(cookie, NEWBIE, { firstName: '<b>x</b>' })
    const sent = JSON.parse(fetchMock.mock.calls.at(-1)[1].body)
    expect(sent.html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(sent.html).not.toContain('<b>x</b>')
  })

  it('keeps an invited record after the invite link expires, and re-inviting updates the names', async () => {
    vi.useFakeTimers()
    const cookie = await signInInviter()
    await invite(cookie)
    vi.advanceTimersByTime(49 * 3600_000)
    const user = await fake.redis.get(`user:${NEWBIE}`)
    expect(user).toMatchObject({ status: 'invited', firstName: 'Nora', lastName: 'Newman', invitedBy: INVITER })
    expect(fake.redis.ttl(`user:${NEWBIE}`)).toBeNull()

    const fresh = await signInInviter() // the first session idled out during the 49 hours
    expect((await invite(fresh, NEWBIE, { firstName: 'Norah' })).res.statusCode).toBe(200)
    expect((await fake.redis.get(`user:${NEWBIE}`)).firstName).toBe('Norah')
  })
})

describe('register', () => {
  it('rejects an email that does not match the invite, without burning it (422)', async () => {
    const { token } = await invite(await signInInviter())
    const bad = await register(post({ inviteToken: token, email: 'someone.else@example.com' }))
    expect(bad.statusCode).toBe(422)
    const good = await register(post({ inviteToken: token, email: NEWBIE }))
    expect(good.statusCode).toBe(200)
  })

  it('matches the invite email case-insensitively', async () => {
    const { token } = await invite(await signInInviter())
    const res = await register(post({ inviteToken: token, email: '  New.Member@Example.COM ' }))
    expect(res.statusCode).toBe(200)
  })

  it('is one-time use (second attempt 410)', async () => {
    const { token } = await invite(await signInInviter())
    expect((await register(post({ inviteToken: token, email: NEWBIE }))).statusCode).toBe(200)
    expect((await register(post({ inviteToken: token, email: NEWBIE }))).statusCode).toBe(410)
  })

  it('expires after 48 hours (410)', async () => {
    vi.useFakeTimers()
    const { token } = await invite(await signInInviter())
    vi.advanceTimersByTime(48 * 3600_000 + 1000)
    expect((await register(post({ inviteToken: token, email: NEWBIE }))).statusCode).toBe(410)
  })

  it('still works just inside the 48-hour window', async () => {
    vi.useFakeTimers()
    const { token } = await invite(await signInInviter())
    vi.advanceTimersByTime(47 * 3600_000)
    expect((await register(post({ inviteToken: token, email: NEWBIE }))).statusCode).toBe(200)
  })

  it('leaves the user pending, sends a confirmation email, and sets no session', async () => {
    const { token } = await invite(await signInInviter())
    const res = await register(post({ inviteToken: token, email: NEWBIE }))
    expect(json(res)).toEqual({ pending: true, email: NEWBIE, emailSent: true })
    expect(res.headers['Set-Cookie']).toBeUndefined()
    expect(await fake.redis.get(`user:${NEWBIE}`)).toMatchObject({ status: 'pending', firstName: 'Nora', lastName: 'Newman' })
    const sent = JSON.parse(fetchMock.mock.calls.at(-1)[1].body)
    expect(sent.text).toMatch(/https:\/\/ogc\.example\.com\/verify\?token=/)
  })

  it('pending users cannot sign in by magic link or Google', async () => {
    const { token } = await invite(await signInInviter())
    await register(post({ inviteToken: token, email: NEWBIE }))
    const before = fetchMock.mock.calls.length
    await login(post({ email: NEWBIE }))
    expect(fetchMock.mock.calls.length).toBe(before) // no sign-in link sent
    expect((await login(post({ googleCredential: `google:${NEWBIE}` }))).statusCode).toBe(403)
  })

  it('accepts a Google account whose email matches the invite, still requiring confirmation', async () => {
    const { token } = await invite(await signInInviter())
    const res = await register(post({ inviteToken: token, googleCredential: `google:${NEWBIE}` }))
    expect(res.statusCode).toBe(200)
    expect(json(res).pending).toBe(true)
    expect((await fake.redis.get(`user:${NEWBIE}`)).provider).toBe('google')
  })

  it('rejects a Google account whose email does not match the invite (422)', async () => {
    const { token } = await invite(await signInInviter())
    const res = await register(post({ inviteToken: token, googleCredential: 'google:wrong@example.com' }))
    expect(res.statusCode).toBe(422)
  })

  it('rejects an invalid Google credential (401)', async () => {
    const { token } = await invite(await signInInviter())
    const res = await register(post({ inviteToken: token, googleCredential: 'forged' }))
    expect(res.statusCode).toBe(401)
  })

  it('rejects a garbage invite token (410)', async () => {
    expect((await register(post({ inviteToken: 'nope', email: NEWBIE }))).statusCode).toBe(410)
  })
})

describe('verify-email', () => {
  async function registerNewbie() {
    const { token } = await invite(await signInInviter())
    await register(post({ inviteToken: token, email: NEWBIE }))
    return tokenFromLastEmail(fetchMock, 'verify')
  }

  it('activates the user and starts a session', async () => {
    const token = await registerNewbie()
    const res = await verifyEmail(post({ token }))
    expect(res.statusCode).toBe(200)
    expect(json(res)).toMatchObject({ authenticated: true, email: NEWBIE, canInvite: false })
    expect(res.headers['Set-Cookie']).toMatch(/^ogc_session=[\w-]{43}; HttpOnly; Secure; SameSite=Strict; Path=\//)
    expect((await fake.redis.get(`user:${NEWBIE}`)).status).toBe('active')
  })

  it('confirmation link is one-time use (410)', async () => {
    const token = await registerNewbie()
    await verifyEmail(post({ token }))
    expect((await verifyEmail(post({ token }))).statusCode).toBe(410)
  })

  it('resend sends a new link for pending users, with an identical response for unknown emails', async () => {
    await registerNewbie()
    const before = fetchMock.mock.calls.length
    const known = await verifyEmail(post({ resend: NEWBIE }))
    expect(fetchMock.mock.calls.length).toBe(before + 1)
    const unknown = await verifyEmail(post({ resend: 'nobody@example.com' }))
    expect(fetchMock.mock.calls.length).toBe(before + 1)
    expect(unknown.statusCode).toBe(known.statusCode)
    expect(unknown.body).toBe(known.body)
  })
})

describe('login', () => {
  it('gives an identical response for registered and unknown emails (no enumeration)', async () => {
    const a = await login(post({ email: INVITER }))
    const b = await login(post({ email: 'stranger@example.com' }))
    expect(a.statusCode).toBe(200)
    expect(b.body).toBe(a.body)
    expect(fetchMock).toHaveBeenCalledTimes(1) // only the inviter got an email
  })

  it('bootstraps an inviter (no invite needed) as an active account', async () => {
    await signInInviter()
    expect((await fake.redis.get(`user:${INVITER}`)).status).toBe('active')
  })

  it('magic link is one-time use and expires after 15 minutes', async () => {
    vi.useFakeTimers()
    await login(post({ email: INVITER }))
    const token = tokenFromLastEmail(fetchMock, 'login')
    expect((await login(post({ loginToken: token }))).statusCode).toBe(200)
    expect((await login(post({ loginToken: token }))).statusCode).toBe(410)

    await login(post({ email: INVITER }))
    const late = tokenFromLastEmail(fetchMock, 'login')
    vi.advanceTimersByTime(15 * 60_000 + 1000)
    expect((await login(post({ loginToken: late }))).statusCode).toBe(410)
  })

  it('signs in an active user with Google', async () => {
    const res = await login(post({ googleCredential: `google:${INVITER}` }))
    expect(res.statusCode).toBe(200)
    expect(sessionCookie(res)).toMatch(/^ogc_session=/)
  })

  it('rejects Google sign-in for an email with no account (403)', async () => {
    expect((await login(post({ googleCredential: 'google:stranger@example.com' }))).statusCode).toBe(403)
  })

  it('requires application/json (415) to block cross-site form posts', async () => {
    const res = await login(post({ email: INVITER }, { contentType: 'text/plain' }))
    expect(res.statusCode).toBe(415)
  })
})

describe('session lifetime', () => {
  it('expires 30 minutes after the most recent request, not the first', async () => {
    vi.useFakeTimers()
    const cookie = await signInInviter()
    const check = async () => json(await session({ httpMethod: 'GET', headers: { cookie } })).authenticated

    vi.advanceTimersByTime(25 * 60_000)
    expect(await check()).toBe(true) // activity at 25m slides the window
    vi.advanceTimersByTime(25 * 60_000)
    expect(await check()).toBe(true) // 50m after sign-in, 25m after last request
    vi.advanceTimersByTime(30 * 60_000 + 1000)
    expect(await check()).toBe(false) // idle for >30m
  })

  it('protected-function guard slides the window too', async () => {
    vi.useFakeTimers()
    const cookie = await signInInviter()
    vi.advanceTimersByTime(29 * 60_000)
    expect((await requireSession({ headers: { cookie } })).email).toBe(INVITER)
    vi.advanceTimersByTime(29 * 60_000)
    expect((await requireSession({ headers: { cookie } })).email).toBe(INVITER)
  })

  it('reports canInvite for inviters only', async () => {
    const cookie = await signInInviter()
    const res = await session({ httpMethod: 'GET', headers: { cookie } })
    expect(json(res)).toMatchObject({ authenticated: true, email: INVITER, canInvite: true })
  })

  it('a new account needs a profile review; saving it clears the flag and sets the name', async () => {
    const { token } = await invite(await signInInviter())
    await register(post({ inviteToken: token, email: NEWBIE }))
    const v = await verifyEmail(post({ token: tokenFromLastEmail(fetchMock, 'verify') }))
    expect(json(v)).toMatchObject({ name: 'Nora Newman', firstName: 'Nora', needsProfile: true, canChangeEmail: true })
    const cookie = sessionCookie(v)
    const saved = await profile(post({ firstName: ' Norah ', lastName: 'Newman-Smith' }, { cookie }))
    expect(json(saved)).toMatchObject({ name: 'Norah Newman-Smith', needsProfile: false })
    const s = json(await session({ httpMethod: 'GET', headers: { cookie } }))
    expect(s).toMatchObject({ name: 'Norah Newman-Smith', needsProfile: false })
  })

  it('profile requires a session (401) and both names (422)', async () => {
    expect((await profile(post({ firstName: 'A', lastName: 'B' }))).statusCode).toBe(401)
    const cookie = await signInInviter()
    expect((await profile(post({ firstName: 'A', lastName: '' }, { cookie }))).statusCode).toBe(422)
  })

  it('falls back to the email as the name when none is set', async () => {
    const cookie = await signInInviter()
    expect(json(await session({ httpMethod: 'GET', headers: { cookie } })).name).toBe(INVITER)
  })

  it('records the last successful login and how it happened', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
    await signInInviter()
    expect(await fake.redis.get(`user:${INVITER}`)).toMatchObject({ lastLoginAt: Date.parse('2026-11-10T12:00:00Z'), lastLoginMethod: 'email' })
    await login(post({ googleCredential: `google:${INVITER}` }))
    expect((await fake.redis.get(`user:${INVITER}`)).lastLoginMethod).toBe('google')
  })

  it('logout ends the session', async () => {
    const cookie = await signInInviter()
    const res = await logout(post({}, { cookie }))
    expect(res.headers['Set-Cookie']).toMatch(/Max-Age=0/)
    expect((await requireSession({ headers: { cookie } })).error.statusCode).toBe(401)
  })

  it('deleting a user revokes their live session immediately', async () => {
    const cookie = await signInInviter()
    process.env.INVITER_EMAILS = '' // otherwise sign-in would re-provision them
    await fake.redis.del(`user:${INVITER}`)
    expect((await requireSession({ headers: { cookie } })).error.statusCode).toBe(401)
  })

  it('fails closed when Redis is not configured', async () => {
    const cookie = await signInInviter()
    fake.redis = null
    expect((await requireSession({ headers: { cookie } })).error.statusCode).toBe(401)
  })

  it('rejects a forged cookie', async () => {
    const res = await requireSession({ headers: { cookie: 'ogc_session=' + 'A'.repeat(43) } })
    expect(res.error.statusCode).toBe(401)
  })
})

describe('security review regressions', () => {
  async function activeNewbie() {
    const { token } = await invite(await signInInviter())
    await register(post({ inviteToken: token, email: NEWBIE }))
    return tokenFromLastEmail(fetchMock, 'verify')
  }

  it('a confirmation link cannot re-activate a disabled account', async () => {
    const verifyToken = await activeNewbie()
    const user = await fake.redis.get(`user:${NEWBIE}`)
    await fake.redis.set(`user:${NEWBIE}`, { ...user, status: 'disabled' })
    const res = await verifyEmail(post({ token: verifyToken }))
    expect(res.statusCode).toBe(410)
    expect((await fake.redis.get(`user:${NEWBIE}`)).status).toBe('disabled')
  })

  it('a disabled inviter stays disabled (no auto re-provisioning)', async () => {
    const cookie = await signInInviter()
    await fake.redis.set(`user:${INVITER}`, { email: INVITER, status: 'disabled' })
    expect((await requireSession({ headers: { cookie } })).error.statusCode).toBe(401)
    const before = fetchMock.mock.calls.length
    await login(post({ email: INVITER }))
    expect(fetchMock.mock.calls.length).toBe(before)
    expect((await login(post({ googleCredential: `google:${INVITER}` }))).statusCode).toBe(403)
  })

  it('pending accounts persist (for the Users tray) but the confirmation link still expires in 24 hours', async () => {
    vi.useFakeTimers()
    const verifyToken = await activeNewbie()
    expect(fake.redis.ttl(`user:${NEWBIE}`)).toBeNull()
    vi.advanceTimersByTime(24 * 3600_000 + 1000)
    expect((await verifyEmail(post({ token: verifyToken }))).statusCode).toBe(410)
    expect((await fake.redis.get(`user:${NEWBIE}`)).status).toBe('pending')
  })

  it('an inviter who was also sent an invite can still bootstrap-sign-in', async () => {
    const cookie = await signInInviter()
    await invite(cookie, 'other.inviter@example.com', { firstName: 'Olive', lastName: 'Other' })
    await login(post({ email: 'other.inviter@example.com' }))
    const res = await login(post({ loginToken: tokenFromLastEmail(fetchMock, 'login') }))
    expect(res.statusCode).toBe(200)
    expect(json(res)).toMatchObject({ name: 'Olive Other', canInvite: true })
  })

  it('an invited (not yet registered) account cannot sign in', async () => {
    await invite(await signInInviter())
    const before = fetchMock.mock.calls.length
    await login(post({ email: NEWBIE }))
    expect(fetchMock.mock.calls.length).toBe(before)
    expect((await login(post({ googleCredential: `google:${NEWBIE}` }))).statusCode).toBe(403)
  })

  it('rejects display-name and quoted email syntax', async () => {
    const cookie = await signInInviter()
    for (const bad of ['x<evil@example.com>', '"victim@example.com"', '["a@b.co"]', 'a b@example.com']) {
      expect((await invite(cookie, bad)).res.statusCode).toBe(422)
      expect((await login(post({ email: bad }))).statusCode).toBe(422)
    }
  })

  it('stored emails round-trip exactly through Upstash-style deserialization', async () => {
    const cookie = await signInInviter()
    const res = await session({ httpMethod: 'GET', headers: { cookie } })
    expect(JSON.parse(res.body).email).toBe(INVITER)
  })

  it('re-inviting a disabled account does not revive it', async () => {
    const cookie = await signInInviter()
    const { token } = await invite(cookie)
    await fake.redis.set(`user:${NEWBIE}`, { email: NEWBIE, status: 'disabled' })
    expect((await invite(cookie)).res.statusCode).toBe(409)
    expect((await register(post({ inviteToken: token, email: NEWBIE }))).statusCode).toBe(403)
    expect((await fake.redis.get(`user:${NEWBIE}`)).status).toBe('disabled')
  })
})
