import { requireAuth } from './_shared/auth.js'

const ASANA_BASE = 'https://app.asana.com/api/1.0'

// Allowlist mirrors the client's accepted file types (IntakeForm ACCEPTED_TYPES).
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
])
const MAX_DECODED_BYTES = 1024 * 1024 // 1 MB after base64 decode

// Approximate decoded size from base64 length without allocating the buffer.
function base64Bytes(b64) {
  const len = b64.length
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((len * 3) / 4) - padding
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON' }),
    }
  }

  const forbidden = requireAuth(body)
  if (forbidden) return forbidden

  const { taskGid, fileName, mimeType, fileData } = body
  if (!taskGid || !fileName || !fileData) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing required fields' }),
    }
  }

  if (!ALLOWED_MIME.has(mimeType)) {
    return {
      statusCode: 415,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unsupported file type' }),
    }
  }

  if (typeof fileData !== 'string' || base64Bytes(fileData) > MAX_DECODED_BYTES) {
    return {
      statusCode: 413,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'File is too large' }),
    }
  }

  // The Asana PAT is workspace-scoped — confirm the target task belongs to the
  // OGC Deacons project before attaching, so a caller can't target arbitrary tasks.
  let preflightRes
  try {
    preflightRes = await fetch(`${ASANA_BASE}/tasks/${encodeURIComponent(taskGid)}?opt_fields=projects`, {
      headers: { Authorization: `Bearer ${process.env.ASANA_PAT}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError'
    return {
      statusCode: timedOut ? 504 : 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: timedOut ? 'Asana took too long to respond. Please try again.' : 'Failed to reach Asana' }),
    }
  }

  if (!preflightRes.ok) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Task not found or not accessible' }),
    }
  }

  const preflight = await preflightRes.json().catch(() => null)
  const inProject = preflight?.data?.projects?.some((p) => p.gid === process.env.ASANA_PROJECT_GID)
  if (!inProject) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Task is not in the allowed project' }),
    }
  }

  const buffer = Buffer.from(fileData, 'base64')
  const form = new FormData()
  form.append('parent', taskGid)
  form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), fileName)

  let asanaRes
  try {
    asanaRes = await fetch(`${ASANA_BASE}/attachments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ASANA_PAT}`,
      },
      body: form,
      signal: AbortSignal.timeout(8000),
    })
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError'
    return {
      statusCode: timedOut ? 504 : 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: timedOut ? 'Asana took too long to respond. Please try again.' : 'Failed to reach Asana' }),
    }
  }

  if (!asanaRes.ok) {
    const errBody = await asanaRes.json().catch(() => ({ errors: [{ message: 'Unknown error' }] }))
    return {
      statusCode: asanaRes.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: errBody.errors?.[0]?.message ?? 'Failed to attach file' }),
    }
  }

  const data = await asanaRes.json()
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }
}
