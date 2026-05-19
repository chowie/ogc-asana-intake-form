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

  // Secondary passphrase check — prevents direct POST abuse bypassing the client gate
  if (body.passphraseToken !== process.env.PASSPHRASE) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Forbidden' }),
    }
  }

  const { title, details, dueDate, submitterName, submitterEmail, followerGid, assigneeGid, summary } = body

  if (!title || !submitterName || !submitterEmail || !followerGid || (!details && !summary)) {
    return {
      statusCode: 422,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing required fields' }),
    }
  }

  const notes = summary
    ? `What: ${summary.what}\nContext: ${summary.context}\nScope: ${summary.scope}\nConstraints / timing: ${summary.constraints}\nDefinition of done: ${summary.definition_of_done}\n\nSubmitted by: ${submitterName} — ${submitterEmail}`
    : `${details}\n\nSubmitted by: ${submitterName} — ${submitterEmail}`

  const payload = {
    data: {
      name: title,
      notes,
      projects: [process.env.ASANA_PROJECT_GID],
      memberships: [{ project: process.env.ASANA_PROJECT_GID, section: process.env.ASANA_INBOX_SECTION_GID }],
      followers: [followerGid],
      ...(assigneeGid && { assignee: assigneeGid }),
      ...(dueDate && { due_on: dueDate }),
    },
  }

  const asanaRes = await fetch(`${ASANA_BASE}/tasks?opt_fields=name,permalink_url`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ASANA_PAT}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!asanaRes.ok) {
    const errBody = await asanaRes.json().catch(() => ({ errors: [{ message: 'Unknown error' }] }))
    return {
      statusCode: asanaRes.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: errBody.errors?.[0]?.message ?? 'Failed to create task' }),
    }
  }

  const data = await asanaRes.json()
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }
}
