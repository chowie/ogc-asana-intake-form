import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PassphraseGate from '../components/PassphraseGate.jsx'

const SERVER_TOKEN = '9999999999999.abcdef.signature'

function mockFetch(valid) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () =>
      valid ? { valid: true, token: SERVER_TOKEN, expiresAt: 9999999999999 } : { valid: false },
  })
}

function mockFetchError() {
  return vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubGlobal('localStorage', {
    setItem: vi.fn(),
    getItem: vi.fn(() => null),
    removeItem: vi.fn(),
    clear: vi.fn(),
  })
})

describe('PassphraseGate', () => {
  it('renders the passphrase input', () => {
    render(<PassphraseGate onAuthenticated={vi.fn()} />)
    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument()
  })

  it('calls onAuthenticated when the correct passphrase is entered', async () => {
    vi.stubGlobal('fetch', mockFetch(true))
    const onAuthenticated = vi.fn()
    render(<PassphraseGate onAuthenticated={onAuthenticated} />)

    await userEvent.type(screen.getByLabelText(/passphrase/i), 'deacon-gate')
    await userEvent.click(screen.getByRole('button', { name: /enter/i }))

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce())
  })

  it('stores the server-issued token (not the passphrase) in localStorage on success', async () => {
    vi.stubGlobal('fetch', mockFetch(true))
    const onAuthenticated = vi.fn()
    render(<PassphraseGate onAuthenticated={onAuthenticated} />)

    await userEvent.type(screen.getByLabelText(/passphrase/i), 'deacon-gate')
    await userEvent.click(screen.getByRole('button', { name: /enter/i }))

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce())
    // The raw passphrase must never be persisted.
    expect(localStorage.setItem).not.toHaveBeenCalledWith('ogc_auth', expect.stringContaining('deacon-gate'))
    expect(localStorage.setItem).toHaveBeenCalledWith('ogc_auth', expect.stringContaining(SERVER_TOKEN))
    expect(localStorage.setItem).toHaveBeenCalledWith('ogc_auth', expect.stringMatching(/"expiresAt":\d+/))
  })

  it('shows an error and does not call onAuthenticated for a wrong passphrase', async () => {
    vi.stubGlobal('fetch', mockFetch(false))
    const onAuthenticated = vi.fn()
    render(<PassphraseGate onAuthenticated={onAuthenticated} />)

    await userEvent.type(screen.getByLabelText(/passphrase/i), 'wrong-passphrase')
    await userEvent.click(screen.getByRole('button', { name: /enter/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/incorrect passphrase/i))
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('clears the error message when the user starts typing again', async () => {
    vi.stubGlobal('fetch', mockFetch(false))
    render(<PassphraseGate onAuthenticated={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/passphrase/i), 'bad')
    await userEvent.click(screen.getByRole('button', { name: /enter/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    await userEvent.type(screen.getByLabelText(/passphrase/i), 'a')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error when the server responds with !ok', async () => {
    vi.stubGlobal('fetch', mockFetchError())
    render(<PassphraseGate onAuthenticated={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/passphrase/i), 'any-input')
    await userEvent.click(screen.getByRole('button', { name: /enter/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('shows an error when fetch rejects (true network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const onAuthenticated = vi.fn()
    render(<PassphraseGate onAuthenticated={onAuthenticated} />)

    await userEvent.type(screen.getByLabelText(/passphrase/i), 'any-input')
    await userEvent.click(screen.getByRole('button', { name: /enter/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('disables the button while checking', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    render(<PassphraseGate onAuthenticated={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/passphrase/i), 'deacon-gate')
    await userEvent.click(screen.getByRole('button', { name: /enter/i }))

    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled()
  })
})
