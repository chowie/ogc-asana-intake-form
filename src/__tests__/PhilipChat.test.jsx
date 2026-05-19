import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PhilipChat from '../components/PhilipChat.jsx'

const defaultSummary = {
  what: 'Fix the heater',
  context: 'The fellowship hall is cold',
  scope: 'One-time repair',
  constraints: 'Before Sunday',
  definition_of_done: 'Heater working',
}

function renderChat(props = {}) {
  const onSend = vi.fn()
  const onConfirm = vi.fn()
  const onEdit = vi.fn()
  render(
    <PhilipChat
      messages={[]}
      askedCount={0}
      maxQ={3}
      onSend={onSend}
      awaitingAI={false}
      showSummary={false}
      summary={null}
      onConfirm={onConfirm}
      onEdit={onEdit}
      {...props}
    />
  )
  return { onSend, onConfirm, onEdit }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PhilipChat — header', () => {
  it('renders "Philip" and "AI Assistant" in header', () => {
    renderChat()
    expect(screen.getByText('Philip')).toBeInTheDocument()
    expect(screen.getByText(/ai assistant/i)).toBeInTheDocument()
  })
})

describe('PhilipChat — messages', () => {
  it('renders philip and user messages', () => {
    renderChat({
      messages: [
        { role: 'philip', text: 'Hello from Philip' },
        { role: 'user', text: 'Hello from user' },
      ],
    })
    expect(screen.getByText('Hello from Philip')).toBeInTheDocument()
    expect(screen.getByText('Hello from user')).toBeInTheDocument()
  })
})

describe('PhilipChat — typing indicator', () => {
  it('shows typing indicator when awaitingAI=true', () => {
    renderChat({ awaitingAI: true })
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument()
  })

  it('hides typing indicator when awaitingAI=false', () => {
    renderChat({ awaitingAI: false })
    expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument()
  })
})

describe('PhilipChat — input', () => {
  it('calls onSend with trimmed text on Send click', async () => {
    const { onSend } = renderChat()
    await userEvent.type(screen.getByPlaceholderText(/type your reply/i), '  My answer  ')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledOnce()
    expect(onSend).toHaveBeenCalledWith('My answer')
  })

  it('calls onSend on Enter key', async () => {
    const { onSend } = renderChat()
    await userEvent.type(screen.getByPlaceholderText(/type your reply/i), 'My answer{Enter}')
    expect(onSend).toHaveBeenCalledOnce()
    expect(onSend).toHaveBeenCalledWith('My answer')
  })

  it('clears input after send', async () => {
    renderChat()
    const input = screen.getByPlaceholderText(/type your reply/i)
    await userEvent.type(input, 'My answer')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(input).toHaveValue('')
  })

  it('does not call onSend when input is empty', async () => {
    const { onSend } = renderChat()
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables input and Send button when awaitingAI=true', () => {
    renderChat({ awaitingAI: true })
    expect(screen.getByPlaceholderText(/type your reply/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })
})

describe('PhilipChat — summary', () => {
  it('shows summary block when showSummary=true', () => {
    renderChat({ showSummary: true, summary: defaultSummary })
    expect(screen.getByTestId('summary-block')).toBeInTheDocument()
  })

  it('hides summary block when showSummary=false', () => {
    renderChat({ showSummary: false, summary: null })
    expect(screen.queryByTestId('summary-block')).not.toBeInTheDocument()
  })

  it('hides input row when showSummary=true', () => {
    renderChat({ showSummary: true, summary: defaultSummary })
    expect(screen.queryByPlaceholderText(/type your reply/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^send$/i })).not.toBeInTheDocument()
  })

  it('calls onConfirm from summary block', async () => {
    const { onConfirm } = renderChat({ showSummary: true, summary: defaultSummary })
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onEdit from summary block', async () => {
    const { onEdit } = renderChat({ showSummary: true, summary: defaultSummary })
    await userEvent.click(screen.getByRole('button', { name: /edit my request/i }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
