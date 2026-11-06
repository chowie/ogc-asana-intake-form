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
  cookie = await seedSession(fake.redis)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function event(body, sessionCookie) {
  return {
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', ...(sessionCookie && { cookie: sessionCookie }) },
    body: JSON.stringify(body),
  }
}

const base = {
  title: 'Heater',
  submitterName: 'Test User',
  submitterEmail: 'u@example.com',
  followerGid: 'GOOD',
  details: 'Broken heater',
}

describe('create-task', () => {
  it('rejects a request with no session (401)', async () => {
    const res = await handler(event({ ...base }))
    expect(res.statusCode).toBe(401)
  })

  it('rejects an unknown followerGid (422)', async () => {
    const res = await handler(event({ ...base, followerGid: 'EVIL' }, cookie))
    expect(res.statusCode).toBe(422)
    expect(JSON.parse(res.body).error).toMatch(/follower or assignee/i)
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
    vi.unstubAllGlobals()
  })

  it('rejects a non-JSON content type (415) — CSRF defense', async () => {
    const res = await handler({ ...event(base, cookie), headers: { cookie, 'content-type': 'text/plain' } })
    expect(res.statusCode).toBe(415)
  })
})
