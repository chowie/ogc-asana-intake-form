function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function attachFile({ taskGid, file }) {
  const passphraseToken = JSON.parse(localStorage.getItem('ogc_auth') ?? 'null')?.token ?? ''
  const fileData = await readFileAsBase64(file)

  const res = await fetch('/.netlify/functions/attach-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskGid, fileName: file.name, mimeType: file.type, fileData, passphraseToken }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error ?? 'Failed to attach file')
  }

  return res.json()
}

export async function createTask({ title, details, dueDate, submitterName, submitterEmail, followerGid, assigneeGid, summary }) {
  const passphraseToken = JSON.parse(localStorage.getItem('ogc_auth') ?? 'null')?.token ?? ''

  const res = await fetch('/.netlify/functions/create-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, details, dueDate, submitterName, submitterEmail, followerGid, assigneeGid, passphraseToken, summary }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error ?? 'Failed to create task')
  }

  return res.json()
}
