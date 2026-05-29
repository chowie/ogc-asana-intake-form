import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { issueToken } from '../_shared/auth.js'
import { handler } from '../chat.js'

let token

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret'
  process.env.ANTHROPIC_API_KEY = 'key'
  token = issueToken().token
})

afterEach(() => {
  vi.restoreAllMocks()
})

function event(body) {
  return { httpMethod: 'POST', body: JSON.stringify(body) }
}

function anthropicReturning(input) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ type: 'tool_use', name: 'respond', input }] }),
  })
}

const reqBody = {
  formData: { title: 'T', details: 'D', submitterName: 'N' },
  messages: [],
}

const SUMMARY = { what: 'W', context: 'C', scope: 'S', constraints: 'K', definition_of_done: 'D' }

describe('chat', () => {
  it('rejects a request with no valid token (403)', async () => {
    const res = await handler(event({ ...reqBody }))
    expect(res.statusCode).toBe(403)
  })

  it('passes a needs_clarification response through (200)', async () => {
    vi.stubGlobal('fetch', anthropicReturning({ status: 'needs_clarification', question: 'When?' }))
    const res = await handler(event({ ...reqBody, passphraseToken: token }))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).question).toBe('When?')
  })

  it('returns 502 when summarized but the summary is missing (#19)', async () => {
    vi.stubGlobal('fetch', anthropicReturning({ status: 'summarized' }))
    const res = await handler(event({ ...reqBody, passphraseToken: token }))
    expect(res.statusCode).toBe(502)
  })

  it('returns 200 when summarized with a complete summary', async () => {
    vi.stubGlobal('fetch', anthropicReturning({ status: 'summarized', summary: SUMMARY }))
    const res = await handler(event({ ...reqBody, passphraseToken: token }))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).summary.what).toBe('W')
  })

  it('puts user fields in a delimited user message, not the system prompt (#10)', async () => {
    const fetchMock = anthropicReturning({ status: 'needs_clarification', question: 'q' })
    vi.stubGlobal('fetch', fetchMock)
    await handler(event({ ...reqBody, passphraseToken: token }))

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    // The user's request text lives in the delimited user message, not the system prompt.
    expect(sent.system).not.toContain('Request details:')
    expect(sent.messages[0].role).toBe('user')
    expect(sent.messages[0].content).toContain('<form_submission>')
    expect(sent.messages[0].content).toContain('Request details:')
  })
})
