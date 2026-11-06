import { ApiError } from './auth.js'

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function attachFile({ taskGid, file }) {
  const fileData = await readFileAsBase64(file)

  const res = await fetch('/.netlify/functions/attach-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskGid, fileName: file.name, mimeType: file.type, fileData }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new ApiError(body.error ?? 'Failed to attach file', res.status)
  }

  return res.json()
}

export async function createTask({ title, details, dueDate, submitterName, submitterEmail, followerGid, assigneeGid, summary }) {

  const res = await fetch('/.netlify/functions/create-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, details, dueDate, submitterName, submitterEmail, followerGid, assigneeGid, summary }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new ApiError(body.error ?? 'Failed to create task', res.status)
  }

  return res.json()
}
