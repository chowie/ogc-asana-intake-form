import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeRedis, seedSession } from './helpers/fake-redis.js'

const fake = vi.hoisted(() => ({ redis: null }))
vi.mock('../_shared/redis.js', () => ({ getRedis: () => fake.redis }))
vi.mock('../_shared/rate-limit.js', () => ({ limit: async () => null }))

vi.mock('../_shared/roster.js', () => ({
  isValidGid: (g) => g === 'GOOD',
  validGids: new Set(['GOOD']),
}))

import { handler } from '../create-task.js'

let cookie

beforeEach(async () => {
  fake.redis = createFakeRedis()
  process.env.ASANA_PAT = 'pat'
  process.env.ASANA_PROJECT_GID = 'proj'
  process.env.ASANA_INBOX_SECTION_GID = 'sect'
  process.env.RESEND_API_KEY = 're_test'
  process.env.EMAIL_FROM = 'OGC <noreply@example.com>'
  cookie = await seedSession(fake.redis, 'member@example.com', { firstName: 'Mary', lastName: 'Member' })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const TASK = { data: { gid: '1', name: 'Heater', permalink_url: 'https://app.asana.com/0/proj/1' } }

/** fetch mock: Asana succeeds; Resend succeeds unless resendOk is false. */
function stubFetch({ resendOk = true } = {}) {
  const fetchMock = vi.fn(async (url) =>
    String(url).includes('resend.com')
      ? { ok: resendOk, text: async () => 'boom' }
      : { ok: true, json: async () => TASK },
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const asanaBody = (fetchMock) => JSON.parse(fetchMock.mock.calls.find(([u]) => String(u).includes('asana'))[1].body).data
const resendCalls = (fetchMock) => fetchMock.mock.calls.filter(([u]) => String(u).includes('resend.com'))

function event(body, sessionCookie) {
  return {
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', ...(sessionCookie && { cookie: sessionCookie }) },
    body: JSON.stringify(body),
  }
}

const base = {
  title: 'Heater',
  details: 'Broken heater',
}

describe('create-task', () => {
  it('rejects a request with no session (401)', async () => {
    const res = await handler(event({ ...base }))
    expect(res.statusCode).toBe(401)
  })

  it('adds no followers — submitters follow the task themselves', async () => {
    const fetchMock = stubFetch()
    const res = await handler(event({ ...base, followerGid: 'GOOD' }, cookie))
    expect(res.statusCode).toBe(200)
    expect(asanaBody(fetchMock)).not.toHaveProperty('followers')
  })

  it("uses the account's name, ignoring a submitterName in the body", async () => {
    const fetchMock = stubFetch()
    await handler(event({ ...base, submitterName: 'The Pastor' }, cookie))
    const notes = asanaBody(fetchMock).notes
    expect(notes).toContain('Submitted by: Mary Member — member@example.com')
    expect(notes).not.toContain('The Pastor')
  })

  it('falls back to the email when the account has no name', async () => {
    cookie = await seedSession(fake.redis, 'noname@example.com', {}, 'N'.repeat(43))
    const fetchMock = stubFetch()
    await handler(event(base, cookie))
    expect(asanaBody(fetchMock).notes).toContain('Submitted by: noname@example.com — noname@example.com')
  })

  it('emails the submitter a receipt with the task link and how to follow it', async () => {
    const fetchMock = stubFetch()
    const res = await handler(event(base, cookie))
    expect(JSON.parse(res.body).emailSent).toBe(true)
    const [call] = resendCalls(fetchMock)
    const sent = JSON.parse(call[1].body)
    expect(sent.to).toEqual(['member@example.com'])
    expect(sent.text).toContain(TASK.data.permalink_url)
    expect(sent.text).toMatch(/free Asana account/)
    expect(sent.text).toMatch(/Request access/)
  })

  it('still returns 200 when the receipt email fails', async () => {
    stubFetch({ resendOk: false })
    const res = await handler(event(base, cookie))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ data: { gid: '1' }, emailSent: false })
  })

  it('rejects an unknown assigneeGid (422)', async () => {
    const res = await handler(event({ ...base, assigneeGid: 'EVIL' }, cookie))
    expect(res.statusCode).toBe(422)
  })

  it('rejects an empty summary with no details (422)', async () => {
    const res = await handler(event({ ...base, details: undefined, summary: {} }, cookie))
    expect(res.statusCode).toBe(422)
  })

  it('falls back to details when summary is empty, without literal "undefined" in notes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { name: 'Heater' } }) })
    vi.stubGlobal('fetch', fetchMock)

    const res = await handler(event({ ...base, summary: {} }, cookie))
    expect(res.statusCode).toBe(200)
    const sentNotes = JSON.parse(fetchMock.mock.calls[0][1].body).data.notes
    expect(sentNotes).toContain('Broken heater')
    expect(sentNotes).not.toContain('undefined')
  })

  it('builds notes from a complete summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { name: 'Heater' } }) })
    vi.stubGlobal('fetch', fetchMock)

    const summary = { what: 'W', context: 'C', scope: 'S', constraints: 'K', definition_of_done: 'D' }
    const res = await handler(event({ ...base, details: undefined, summary }, cookie))
    expect(res.statusCode).toBe(200)
    const sentNotes = JSON.parse(fetchMock.mock.calls[0][1].body).data.notes
    expect(sentNotes).toContain('What: W')
    expect(sentNotes).not.toContain('undefined')
  })

  it('attributes the task to the signed-in account, ignoring a spoofed submitterEmail', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { name: 'Heater' } }) })
    vi.stubGlobal('fetch', fetchMock)
    await handler(event({ ...base, submitterEmail: 'pastor@example.com' }, cookie))
    const notes = JSON.parse(fetchMock.mock.calls[0][1].body).data.notes
    expect(notes).toContain('member@example.com')
    expect(notes).not.toContain('pastor@example.com')
  })

  it('rejects a non-JSON content type (415) — CSRF defense', async () => {
    const res = await handler({ ...event(base, cookie), headers: { cookie, 'content-type': 'text/plain' } })
    expect(res.statusCode).toBe(415)
  })
})
