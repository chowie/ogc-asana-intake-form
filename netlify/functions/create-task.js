import { requireSession } from './_shared/session.js'
import { requireJsonContentType } from './_shared/http.js'
import { isValidGid } from './_shared/roster.js'

const ASANA_BASE = 'https://app.asana.com/api/1.0'

const SUMMARY_FIELDS = ['what', 'context', 'scope', 'constraints', 'definition_of_done']

function isCompleteSummary(summary) {
  return (
    !!summary &&
    typeof summary === 'object' &&
    SUMMARY_FIELDS.every((f) => typeof summary[f] === 'string' && summary[f].trim() !== '')
  )
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // JSON-only (forces a CORS preflight) — CSRF defense alongside SameSite=Strict.
  const badType = requireJsonContentType(event)
  if (badType) return badType

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

  // Session check — also slides the 30-minute inactivity window.
  const session = await requireSession(event)
  if (session.error) return session.error

  const { title, details, dueDate, submitterName, followerGid, assigneeGid, summary } = body
  // Attribution comes from the signed-in account, never the request body, so
  // nobody can file a task in someone else's name.
  const submitterEmail = session.email

  const completeSummary = isCompleteSummary(summary)
  // A complete summary OR free-text details is required. An empty summary {}
  // no longer slips through (it would have produced literal "undefined" notes).
  if (!title || !submitterName || !submitterEmail || !followerGid || (!details && !completeSummary)) {
    return {
      statusCode: 422,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing required fields' }),
    }
  }

  // Follower/assignee must be real roster members — block adding arbitrary
  // workspace users (who would get notified) via a direct POST.
  if (!isValidGid(followerGid) || (assigneeGid && !isValidGid(assigneeGid))) {
    return {
      statusCode: 422,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unknown follower or assignee' }),
    }
  }

  const notes = completeSummary
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

  let asanaRes
  try {
    asanaRes = await fetch(`${ASANA_BASE}/tasks?opt_fields=name,permalink_url`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ASANA_PAT}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
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
