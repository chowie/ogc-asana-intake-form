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

const authApi = vi.hoisted(() => ({
  getSession: vi.fn(),
  logout: vi.fn(),
  signInWithGoogle: vi.fn(),
  confirmEmail: vi.fn(),
  redeemLoginLink: vi.fn(),
  registerWithEmail: vi.fn(),
  createInvite: vi.fn(),
}))
vi.mock('../lib/auth.js', async (importOriginal) => ({ ...(await importOriginal()), ...authApi }))

// Stand-in for the Google Identity Services button: clicking it yields a credential.
vi.mock('../components/GoogleButton.jsx', () => ({
  default: ({ onCredential }) => <button type="button" onClick={() => onCredential('google-cred')}>Google</button>,
  googleEnabled: () => true,
}))

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

const MEMBER = { authenticated: true, email: 'one@example.com', canInvite: false }
const INVITER = { authenticated: true, email: 'deacon@example.com', canInvite: true }

function authenticate(session = MEMBER) {
  authApi.getSession.mockResolvedValue(session)
}

async function submitForm() {
  await userEvent.selectOptions(await screen.findByLabelText(/your name/i), 'Test User One')
  await userEvent.type(screen.getByLabelText(/request title/i), 'Heater')
  await userEvent.type(screen.getByLabelText(/request details/i), 'Broken heater')
  await userEvent.click(screen.getByRole('button', { name: /submit request/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  authApi.getSession.mockResolvedValue({ authenticated: false })
  authApi.logout.mockResolvedValue({ ok: true })
  window.history.replaceState(null, '', '/')
})

describe('App — auth gating', () => {
  it('shows the sign-in screen when there is no session', async () => {
    render(<App />)
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign-in link/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument()
  })

  it('shows the sign-in screen when the session check fails', async () => {
    authApi.getSession.mockRejectedValue(new Error('offline'))
    render(<App />)
    expect(await screen.findByRole('button', { name: /sign-in link/i })).toBeInTheDocument()
  })

  it('shows the form, the email, and Sign out when signed in', async () => {
    authenticate()
    render(<App />)
    expect(await screen.findByLabelText(/your name/i)).toBeInTheDocument()
    expect(screen.getByText('one@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('keeps no auth state in localStorage (session is an HttpOnly cookie)', async () => {
    authenticate()
    render(<App />)
    await screen.findByLabelText(/your name/i)
    expect(localStorage.getItem('ogc_auth')).toBeNull()
    expect(Object.keys(localStorage).filter((k) => /auth|token|session/i.test(k))).toEqual([])
  })

  it('signs out back to the sign-in screen', async () => {
    authenticate()
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /sign out/i }))
    expect(authApi.logout).toHaveBeenCalledOnce()
    expect(await screen.findByRole('button', { name: /sign-in link/i })).toBeInTheDocument()
  })

  it('signs in with Google from the sign-in screen', async () => {
    authApi.signInWithGoogle.mockResolvedValue(MEMBER)
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Google' }))
    expect(authApi.signInWithGoogle).toHaveBeenCalledWith('google-cred')
    expect(await screen.findByLabelText(/your name/i)).toBeInTheDocument()
  })
})

describe('App — session expiry (30-min idle)', () => {
  it('a 401 from the chat drops to sign-in, and re-signing in restores the request', async () => {
    authenticate()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))
    render(<App />)
    await submitForm()

    expect(await screen.findByText(/session expired/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument()

    authApi.signInWithGoogle.mockResolvedValue(MEMBER)
    await userEvent.click(screen.getByRole('button', { name: 'Google' }))

    expect(await screen.findByLabelText(/request title/i)).toHaveValue('Heater')
    expect(screen.getByLabelText(/request details/i)).toHaveValue('Broken heater')
  })

  it('a sign-in completed in another tab (magic link) resumes this tab on focus', async () => {
    authenticate()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))
    render(<App />)
    await submitForm()
    expect(await screen.findByText(/session expired/i)).toBeInTheDocument()

    // The user clicks the emailed link in a new tab; the cookie is now set.
    authApi.getSession.mockResolvedValue(MEMBER)
    window.dispatchEvent(new Event('focus'))

    expect(await screen.findByLabelText(/request title/i)).toHaveValue('Heater')
  })

  it('a 401 from createTask drops to sign-in instead of showing a generic error', async () => {
    authenticate()
    vi.stubGlobal('fetch', fetchSequence({ status: 'summarized', summary: SUMMARY }))
    asana.createTask.mockRejectedValue(Object.assign(new Error('Your session has expired.'), { status: 401 }))
    render(<App />)
    await submitForm()
    await waitFor(() => expect(screen.getByText(/summary for the deacons/i)).toBeInTheDocument(), { timeout: 3000 })
    await userEvent.click(screen.getByRole('button', { name: /confirm & send/i }))
    expect(await screen.findByText(/session expired/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign-in link/i })).toBeInTheDocument()
  })
})

describe('App — emailed-link routes', () => {
  it('/invite shows registration and strips the token from the URL', async () => {
    window.history.replaceState(null, '', '/invite?token=abc123')
    render(<App />)
    expect(await screen.findByText(/accept your invitation/i)).toBeInTheDocument()
    expect(window.location.pathname + window.location.search).toBe('/')
  })

  it('/invite → register shows the check-your-email screen and keeps the app locked', async () => {
    window.history.replaceState(null, '', '/invite?token=abc123')
    authApi.registerWithEmail.mockResolvedValue({ pending: true, email: 'new@example.com', emailSent: true })
    render(<App />)
    await userEvent.type(await screen.findByLabelText(/email/i), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: /^register$/i }))
    expect(authApi.registerWithEmail).toHaveBeenCalledWith('abc123', 'new@example.com')
    expect(await screen.findByText(/we sent a confirmation email to/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument()
  })

  it('/invite shows the server error for a mismatched email', async () => {
    window.history.replaceState(null, '', '/invite?token=abc123')
    authApi.registerWithEmail.mockRejectedValue(new Error('That email does not match the one this invite was sent to.'))
    render(<App />)
    await userEvent.type(await screen.findByLabelText(/email/i), 'wrong@example.com')
    await userEvent.click(screen.getByRole('button', { name: /^register$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not match/i)
  })

  it('/verify spends the token only on click, then opens the form', async () => {
    window.history.replaceState(null, '', '/verify?token=vtok')
    authApi.confirmEmail.mockResolvedValue(MEMBER)
    render(<App />)
    const btn = await screen.findByRole('button', { name: /confirm my email/i })
    expect(authApi.confirmEmail).not.toHaveBeenCalled() // a link-scanner page load must not consume it
    await userEvent.click(btn)
    expect(authApi.confirmEmail).toHaveBeenCalledWith('vtok')
    expect(await screen.findByLabelText(/your name/i)).toBeInTheDocument()
  })

  it('/login redeems the magic link on click', async () => {
    window.history.replaceState(null, '', '/login?token=ltok')
    authApi.redeemLoginLink.mockResolvedValue(MEMBER)
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /^sign in$/i }))
    expect(authApi.redeemLoginLink).toHaveBeenCalledWith('ltok')
    expect(await screen.findByLabelText(/your name/i)).toBeInTheDocument()
  })
})

describe('App — invites', () => {
  it('hides the Invite button from non-inviters', async () => {
    authenticate(MEMBER)
    render(<App />)
    await screen.findByLabelText(/your name/i)
    expect(screen.queryByRole('button', { name: /^invite$/i })).not.toBeInTheDocument()
  })

  it('lets an inviter create an invite and copy the link', async () => {
    authenticate(INVITER)
    const link = 'https://ogc.example.com/invite?token=xyz'
    authApi.createInvite.mockResolvedValue({ link, expiresAt: Date.now() + 172_800_000, emailSent: true })
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: /^invite$/i }))
    await userEvent.type(screen.getByLabelText(/their email/i), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: /create invite/i }))

    expect(authApi.createInvite).toHaveBeenCalledWith('new@example.com', true)
    expect(await screen.findByLabelText(/invite link/i)).toHaveValue(link)
    expect(screen.getByText(/invite emailed to/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^copy$/i }))
    expect(writeText).toHaveBeenCalledWith(link)
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('can create a copy-only invite without emailing it', async () => {
    authenticate(INVITER)
    authApi.createInvite.mockResolvedValue({ link: 'https://x/invite?token=y', expiresAt: Date.now() + 1, emailSent: false })
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /^invite$/i }))
    await userEvent.type(screen.getByLabelText(/their email/i), 'new@example.com')
    await userEvent.click(screen.getByLabelText(/email the invite/i))
    await userEvent.click(screen.getByRole('button', { name: /create invite/i }))
    expect(authApi.createInvite).toHaveBeenCalledWith('new@example.com', false)
    expect(await screen.findByText(/send it however you like/i)).toBeInTheDocument()
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
    await userEvent.selectOptions(await screen.findByLabelText(/your name/i), 'Test User One')
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
