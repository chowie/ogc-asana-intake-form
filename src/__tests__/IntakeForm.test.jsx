import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IntakeForm from '../components/IntakeForm.jsx'

const TEST_STAFF = vi.hoisted(() => [
  { name: 'Test User One', email: 'one@example.com', asanaGid: '0000000000000001' },
  { name: 'Test User Two', email: 'two@example.com', asanaGid: '0000000000000002' },
  { name: 'Test User Three', email: 'three@example.com', asanaGid: '0000000000000003' },
])

vi.mock('../config/staff.js', () => ({
  STAFF: TEST_STAFF,
}))

function renderForm(props = {}) {
  const onSubmit = vi.fn()
  render(<IntakeForm onSubmit={onSubmit} frozen={false} submitting={false} apiError={null} {...props} />)
  return { onSubmit }
}

async function fillRequiredFields(title = 'Test Request', details = 'Some details here') {
  await userEvent.clear(screen.getByLabelText(/request title/i))
  await userEvent.type(screen.getByLabelText(/request title/i), title)
  await userEvent.clear(screen.getByLabelText(/request details/i))
  await userEvent.type(screen.getByLabelText(/request details/i), details)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('IntakeForm — submitter comes from the account (hidden)', () => {
  it('shows no name picker and no email field', () => {
    renderForm({ accountName: 'Mary Member', accountEmail: 'me@example.com' })
    expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/your email/i)).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('me@example.com')).not.toBeVisible()
  })

  it('carries the name and email in hidden fields', () => {
    renderForm({ accountName: 'Mary Member', accountEmail: 'me@example.com' })
    expect(document.querySelector('input[type="hidden"][name="submitterName"]')).toHaveValue('Mary Member')
    expect(document.querySelector('input[type="hidden"][name="submitterEmail"]')).toHaveValue('me@example.com')
  })

  it('falls back to the email when the account has no name', () => {
    renderForm({ accountName: '', accountEmail: 'me@example.com' })
    expect(document.querySelector('input[name="submitterName"]')).toHaveValue('me@example.com')
  })
})

describe('IntakeForm — validation', () => {
  it('blocks submission and shows errors when required fields are empty', async () => {
    const { onSubmit } = renderForm()
    await userEvent.click(screen.getByRole('button', { name: /submit request/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/request title is required/i)).toBeInTheDocument()
    expect(screen.getByText(/request details are required/i)).toBeInTheDocument()
  })

  it('blocks submission when only the title is filled', async () => {
    const { onSubmit } = renderForm()
    await userEvent.type(screen.getByLabelText(/request title/i), 'Just a title')
    await userEvent.click(screen.getByRole('button', { name: /submit request/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('IntakeForm — onSubmit payload', () => {
  it('calls onSubmit with the account name/email and no follower', async () => {
    const { onSubmit } = renderForm({ accountName: 'Mary Member', accountEmail: 'me@example.com' })
    await fillRequiredFields('Fix the heater', 'The fellowship hall heater is broken.')
    await userEvent.type(screen.getByLabelText(/due date/i), '2026-06-01')
    await userEvent.click(screen.getByRole('button', { name: /submit request/i }))

    expect(onSubmit).toHaveBeenCalledOnce()
    const [args] = onSubmit.mock.calls[0]
    expect(args.submitterName).toBe('Mary Member')
    expect(args.submitterEmail).toBe('me@example.com')
    expect(args.title).toBe('Fix the heater')
    expect(args.details).toBe('The fellowship hall heater is broken.')
    expect(args.dueDate).toBe('2026-06-01')
    expect(args).not.toHaveProperty('followerGid')
  })

  it('sends null dueDate when not provided', async () => {
    const { onSubmit } = renderForm()
    await fillRequiredFields('Budget review', 'Need to review Q3 budget.')
    await userEvent.click(screen.getByRole('button', { name: /submit request/i }))

    expect(onSubmit).toHaveBeenCalledOnce()
    const [args] = onSubmit.mock.calls[0]
    expect(args.dueDate).toBeNull()
  })
})

describe('IntakeForm — frozen prop', () => {
  it('disables all inputs and button when frozen=true', () => {
    renderForm({ frozen: true })
    expect(screen.getByRole('button', { name: /submit request/i })).toBeDisabled()
    expect(screen.getByLabelText(/assign to/i)).toBeDisabled()
    expect(screen.getByLabelText(/request title/i)).toBeDisabled()
    expect(screen.getByLabelText(/request details/i)).toBeDisabled()
  })
})

describe('IntakeForm — submitting prop', () => {
  it('shows "Reviewing your request…" and disables button when submitting=true', () => {
    renderForm({ submitting: true })
    const btn = screen.getByRole('button', { name: /reviewing your request/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toBeDisabled()
  })
})

describe('IntakeForm — apiError prop', () => {
  it('shows error banner when apiError is set', () => {
    renderForm({ apiError: 'Something went wrong' })
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('shows no error banner when apiError is null', () => {
    renderForm({ apiError: null })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('IntakeForm — file attachment', () => {
  const fileInput = () => document.querySelector('input[type="file"]')

  it('accepts a small file, shows its name, and calls onFileChange', async () => {
    const onFileChange = vi.fn()
    render(<IntakeForm onSubmit={vi.fn()} onFileChange={onFileChange} frozen={false} submitting={false} apiError={null} />)
    const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' })

    await userEvent.upload(fileInput(), file)

    expect(onFileChange).toHaveBeenCalledWith(file)
    expect(screen.getByText('doc.pdf')).toBeInTheDocument()
    expect(screen.queryByText(/700 KB or smaller/i)).not.toBeInTheDocument()
  })

  it('rejects a file over 700 KB and reports null', async () => {
    const onFileChange = vi.fn()
    render(<IntakeForm onSubmit={vi.fn()} onFileChange={onFileChange} frozen={false} submitting={false} apiError={null} />)
    const big = new File(['a'.repeat(701 * 1024)], 'big.pdf', { type: 'application/pdf' })

    await userEvent.upload(fileInput(), big)

    expect(screen.getByText(/700 KB or smaller/i)).toBeInTheDocument()
    expect(onFileChange).toHaveBeenCalledWith(null)
    expect(screen.queryByText('big.pdf')).not.toBeInTheDocument()
  })

  it('clears a selected file when the remove button is clicked', async () => {
    const onFileChange = vi.fn()
    render(<IntakeForm onSubmit={vi.fn()} onFileChange={onFileChange} frozen={false} submitting={false} apiError={null} />)
    const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' })

    await userEvent.upload(fileInput(), file)
    expect(screen.getByText('doc.pdf')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /remove file/i }))

    expect(onFileChange).toHaveBeenLastCalledWith(null)
    expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument()
    expect(fileInput()).toBeInTheDocument()
  })
})

describe('IntakeForm — assignee', () => {
  it('lists the whole roster', () => {
    renderForm({ accountName: 'Test User One', accountEmail: 'one@example.com' })
    const options = [...screen.getByLabelText(/assign to/i).querySelectorAll('option')].map((o) => o.textContent)
    expect(options).toEqual(['— Unassigned —', 'Test User One', 'Test User Two', 'Test User Three'])
  })
})

describe('IntakeForm — initialData prop', () => {
  it('pre-populates fields from initialData', () => {
    renderForm({
      initialData: {
        submitterName: 'Test User Two',
        submitterEmail: 'two@example.com',
        title: 'Pre-filled title',
        details: 'Pre-filled details',
        dueDate: '2026-07-01',
      },
    })
    expect(screen.getByLabelText(/request title/i)).toHaveValue('Pre-filled title')
    expect(screen.getByLabelText(/request details/i)).toHaveValue('Pre-filled details')
  })
})
