import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { issueToken } from '../_shared/auth.js'
import { handler } from '../attach-task.js'

let token

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret'
  process.env.ASANA_PAT = 'pat'
  process.env.ASANA_PROJECT_GID = 'proj'
  token = issueToken().token
})

afterEach(() => {
  vi.restoreAllMocks()
})

function event(body) {
  return { httpMethod: 'POST', body: JSON.stringify(body) }
}

const smallPdf = Buffer.from('hello').toString('base64')

const base = {
  taskGid: 'task1',
  fileName: 'doc.pdf',
  mimeType: 'application/pdf',
  fileData: smallPdf,
}

describe('attach-task', () => {
  it('rejects a request with no valid token (403)', async () => {
    const res = await handler(event({ ...base }))
    expect(res.statusCode).toBe(403)
  })

  it('rejects an unsupported MIME type (415)', async () => {
    const res = await handler(event({ ...base, passphraseToken: token, mimeType: 'application/x-msdownload' }))
    expect(res.statusCode).toBe(415)
  })

  it('rejects an oversized file (413)', async () => {
    const big = Buffer.alloc(1024 * 1024 + 1).toString('base64')
    const res = await handler(event({ ...base, passphraseToken: token, fileData: big }))
    expect(res.statusCode).toBe(413)
  })

  it('rejects a task outside the allowed project (403)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { projects: [{ gid: 'someOtherProject' }] } }),
    }))
    const res = await handler(event({ ...base, passphraseToken: token }))
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error).toMatch(/allowed project/i)
  })

  it('uploads when the task is in the allowed project (200)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { projects: [{ gid: 'proj' }] } }) }) // preflight
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { gid: 'att1' } }) }) // upload
    vi.stubGlobal('fetch', fetchMock)

    const res = await handler(event({ ...base, passphraseToken: token }))
    expect(res.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
