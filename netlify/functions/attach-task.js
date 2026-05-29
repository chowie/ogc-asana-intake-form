import { requireAuth } from './_shared/auth.js'

const ASANA_BASE = 'https://app.asana.com/api/1.0'

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

  const buffer = Buffer.from(fileData, 'base64')
  const form = new FormData()
  form.append('parent', taskGid)
  form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), fileName)

  const asanaRes = await fetch(`${ASANA_BASE}/attachments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ASANA_PAT}`,
    },
    body: form,
  })

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
