import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_STAFF = vi.hoisted(() => [
  { name: 'Test User One', email: 'one@example.com', asanaGid: '0000000000000001' },
  { name: 'Test User Two', email: 'two@example.com', asanaGid: '0000000000000002' },
])

vi.mock('../config/staff.js', () => ({
  STAFF: TEST_STAFF,
  findStaff: (name) => TEST_STAFF.find((s) => s.name === name) ?? null,
}))

const asana = vi.hoisted(() => ({ createTask: vi.fn(), attachFile: vi.fn() }))
vi.mock('../lib/asana.js', () => asana)

import App from '../App.jsx'

const SUMMARY = {
  what: 'Fix the heater',
  context: 'Fellowship hall is cold',
  scope: 'HVAC only',
  constraints: 'Before Sunday',
  definition_of_done: 'Heater runs',
}

function ok(payload) {
  return { ok: true, json: async () => payload }
}

// Returns each payload in sequence, repeating the last for any extra calls.
function fetchSequence(...payloads) {
  let i = 0
  return vi.fn().mockImplementation(() => {
    const p = payloads[Math.min(i, payloads.length - 1)]
    i += 1
    return Promise.resolve(typeof p === 'function' ? p() : ok(p))
  })
}

function authenticate() {
  localStorage.setItem('ogc_auth', JSON.stringify({ token: 't.t.t', expiresAt: Date.now() + 3_600_000 }))
}

async function submitForm() {
  await userEvent.selectOptions(screen.getByLabelText(/your name/i), 'Test User One')
  await userEvent.type(screen.getByLabelText(/request title/i), 'Heater')
  await userEvent.type(screen.getByLabelText(/request details/i), 'Broken heater')
  await userEvent.click(screen.getByRole('button', { name: /submit request/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('App — auth gating (T3)', () => {
  it('shows the passphrase gate when no auth is stored', () => {
    render(<App />)
    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument()
  })

  it('shows the gate when the stored token is expired', () => {
    localStorage.setItem('ogc_auth', JSON.stringify({ token: 't.t.t', expiresAt: Date.now() - 1000 }))
    render(<App />)
    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument()
  })

  it('shows the form when a valid, unexpired token is stored', () => {
    authenticate()
    render(<App />)
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument()
  })
})

describe('App — callPhilip error paths (T1)', () => {
  it('shows an error when the chat fetch rejects', async () => {
    authenticate()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    render(<App />)
    await submitForm()

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/reach the assistant/i))
  })

  it('shows the server error message when the chat responds !ok', async () => {
    authenticate()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Boom' }) }))
    render(<App />)
    await submitForm()

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Boom'))
  })
})

describe('App — clear → summarized recursion (T1)', () => {
  it('produces a summary when Philip returns clear then summarized', async () => {
    authenticate()
    vi.stubGlobal('fetch', fetchSequence({ status: 'clear' }, { status: 'summarized', summary: SUMMARY }))
    render(<App />)
    await submitForm()

    await waitFor(() => expect(screen.getByText(/summary for the deacons/i)).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByText('Fix the heater')).toBeInTheDocument()
  })
})

describe('App — confirm flow (T1)', () => {
  async function reachSummary() {
    vi.stubGlobal('fetch', fetchSequence({ status: 'summarized', summary: SUMMARY }))
    render(<App />)
    await submitForm()
    await waitFor(() => expect(screen.getByText(/summary for the deacons/i)).toBeInTheDocument(), { timeout: 3000 })
  }

  it('creates the task and shows the success screen', async () => {
    authenticate()
    asana.createTask.mockResolvedValue({ data: { gid: '1', name: 'Heater', permalink_url: 'http://x' } })
    await reachSummary()

    await userEvent.click(screen.getByRole('button', { name: /confirm & send/i }))

    await waitFor(() => expect(screen.getByText(/request sent to the deacons/i)).toBeInTheDocument())
    expect(asana.createTask).toHaveBeenCalledOnce()
    expect(asana.attachFile).not.toHaveBeenCalled()
  })

  it('does not create duplicate tasks on a double-click (in-flight guard)', async () => {
    authenticate()
    let resolveCreate
    asana.createTask.mockReturnValue(new Promise((r) => { resolveCreate = r }))
    await reachSummary()

    const btn = screen.getByRole('button', { name: /confirm & send/i })
    await userEvent.click(btn)
    await userEvent.click(btn)

    expect(asana.createTask).toHaveBeenCalledOnce()
    resolveCreate({ data: { gid: '1', name: 'Heater', permalink_url: 'http://x' } })
    await waitFor(() => expect(screen.getByText(/request sent to the deacons/i)).toBeInTheDocument())
  })

  it('shows an error and stays put when createTask throws', async () => {
    authenticate()
    asana.createTask.mockRejectedValue(new Error('Nope'))
    await reachSummary()

    await userEvent.click(screen.getByRole('button', { name: /confirm & send/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Nope'))
    expect(screen.queryByText(/request sent to the deacons/i)).not.toBeInTheDocument()
  })

  it('still succeeds (with a warning) when attachFile fails after the task is created', async () => {
    authenticate()
    asana.createTask.mockResolvedValue({ data: { gid: '1', name: 'Heater', permalink_url: 'http://x' } })
    asana.attachFile.mockRejectedValue(new Error('attach boom'))
    vi.stubGlobal('fetch', fetchSequence({ status: 'summarized', summary: SUMMARY }))
    render(<App />)

    // Attach a file before submitting so the confirm path calls attachFile.
    await userEvent.selectOptions(screen.getByLabelText(/your name/i), 'Test User One')
    await userEvent.type(screen.getByLabelText(/request title/i), 'Heater')
    await userEvent.type(screen.getByLabelText(/request details/i), 'Broken heater')
    await userEvent.upload(document.querySelector('input[type="file"]'), new File(['x'], 'doc.pdf', { type: 'application/pdf' }))
    await userEvent.click(screen.getByRole('button', { name: /submit request/i }))

    await waitFor(() => expect(screen.getByText(/summary for the deacons/i)).toBeInTheDocument(), { timeout: 3000 })
    await userEvent.click(screen.getByRole('button', { name: /confirm & send/i }))

    await waitFor(() => expect(screen.getByText(/request sent to the deacons/i)).toBeInTheDocument())
    expect(asana.attachFile).toHaveBeenCalledOnce()
    expect(screen.getByText(/couldn’t be uploaded/i)).toBeInTheDocument()
  })
})
