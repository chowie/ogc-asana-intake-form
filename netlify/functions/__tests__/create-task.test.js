import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { issueToken } from '../_shared/auth.js'

vi.mock('../_shared/roster.js', () => ({
  isValidGid: (g) => g === 'GOOD',
  validGids: new Set(['GOOD']),
}))

import { handler } from '../create-task.js'

let token

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret'
  process.env.ASANA_PAT = 'pat'
  process.env.ASANA_PROJECT_GID = 'proj'
  process.env.ASANA_INBOX_SECTION_GID = 'sect'
  token = issueToken().token
})

afterEach(() => {
  vi.restoreAllMocks()
})

function event(body) {
  return { httpMethod: 'POST', body: JSON.stringify(body) }
}

const base = {
  title: 'Heater',
  submitterName: 'Test User',
  submitterEmail: 'u@example.com',
  followerGid: 'GOOD',
  details: 'Broken heater',
}

describe('create-task', () => {
  it('rejects a request with no valid token (403)', async () => {
    const res = await handler(event({ ...base }))
    expect(res.statusCode).toBe(403)
  })

  it('rejects an unknown followerGid (422)', async () => {
    const res = await handler(event({ ...base, passphraseToken: token, followerGid: 'EVIL' }))
    expect(res.statusCode).toBe(422)
    expect(JSON.parse(res.body).error).toMatch(/follower or assignee/i)
  })

  it('rejects an unknown assigneeGid (422)', async () => {
    const res = await handler(event({ ...base, passphraseToken: token, assigneeGid: 'EVIL' }))
    expect(res.statusCode).toBe(422)
  })

  it('rejects an empty summary with no details (422)', async () => {
    const res = await handler(event({ ...base, passphraseToken: token, details: undefined, summary: {} }))
    expect(res.statusCode).toBe(422)
  })

  it('falls back to details when summary is empty, without literal "undefined" in notes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { name: 'Heater' } }) })
    vi.stubGlobal('fetch', fetchMock)

    const res = await handler(event({ ...base, passphraseToken: token, summary: {} }))
    expect(res.statusCode).toBe(200)
    const sentNotes = JSON.parse(fetchMock.mock.calls[0][1].body).data.notes
    expect(sentNotes).toContain('Broken heater')
    expect(sentNotes).not.toContain('undefined')
  })

  it('builds notes from a complete summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { name: 'Heater' } }) })
    vi.stubGlobal('fetch', fetchMock)

    const summary = { what: 'W', context: 'C', scope: 'S', constraints: 'K', definition_of_done: 'D' }
    const res = await handler(event({ ...base, passphraseToken: token, details: undefined, summary }))
    expect(res.statusCode).toBe(200)
    const sentNotes = JSON.parse(fetchMock.mock.calls[0][1].body).data.notes
    expect(sentNotes).toContain('What: W')
    expect(sentNotes).not.toContain('undefined')
  })
})
