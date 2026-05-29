import { useState } from 'react'

function PhilipAvatar() {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-9 h-9 rounded-full flex-shrink-0"
      aria-hidden="true"
    >
      {/* Background */}
      <circle cx="20" cy="20" r="20" fill="#deeade" />
      {/* Shirt */}
      <ellipse cx="20" cy="41" rx="14" ry="9" fill="#2f6b3a" />
      {/* White collar */}
      <path d="M13.5 35 L20 28.5 L26.5 35" fill="white" />
      {/* Neck */}
      <rect x="17.2" y="27" width="5.6" height="5" rx="2" fill="#e8b98a" />
      {/* Head */}
      <circle cx="20" cy="18" r="10.5" fill="#e8b98a" />
      {/* Hair */}
      <path d="M9.5 17 Q9.5 6.5 20 6.5 Q30.5 6.5 30.5 17" fill="#5c3d2e" />
      {/* Eyes */}
      <ellipse cx="16.5" cy="17.5" rx="1.5" ry="1.6" fill="#2d1f14" />
      <ellipse cx="23.5" cy="17.5" rx="1.5" ry="1.6" fill="#2d1f14" />
      {/* Eye shine */}
      <circle cx="17.1" cy="16.8" r="0.55" fill="white" />
      <circle cx="24.1" cy="16.8" r="0.55" fill="white" />
      {/* Smile */}
      <path d="M15.5 21.5 Q20 25.5 24.5 21.5" stroke="#2d1f14" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2">
      <div
        className="px-4 py-3 text-sm bg-[#f6f7fb] border border-[#e7e9f3] rounded-xl rounded-tl-[4px] text-gray-500 flex gap-1 items-center"
        data-testid="typing-indicator"
      >
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  )
}

function SummaryBlock({ summary, onConfirm, onEdit, awaitingConfirm }) {
  const rows = [
    { label: 'What', value: summary.what },
    { label: 'Context', value: summary.context },
    { label: 'Scope', value: summary.scope },
    { label: 'Constraints / timing', value: summary.constraints },
    { label: 'Definition of done', value: summary.definition_of_done },
  ]

  return (
    <div className="flex items-start" data-testid="summary-block">
      <div className="w-full px-4 py-3 text-sm bg-[#f6f7fb] border border-[#e7e9f3] rounded-xl rounded-tl-[4px]">
        <p className="text-[10.5px] font-semibold tracking-[0.04em] uppercase text-gray-500 mb-3">
          Summary for the deacons
        </p>
        <div className="space-y-2">
          {rows.map(({ label, value }) => (
            <div key={label}>
              <span className="text-[10.5px] font-semibold tracking-[0.04em] uppercase text-gray-400">
                {label}
              </span>
              <p className="text-gray-800 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onEdit}
            disabled={awaitingConfirm}
            className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Edit my request
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={awaitingConfirm}
            className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {awaitingConfirm ? 'Sending…' : 'Confirm & send'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PhilipChat({
  messages,
  askedCount,
  maxQ,
  onSend,
  awaitingAI,
  showSummary,
  summary,
  awaitingConfirm,
  onConfirm,
  onEdit,
}) {
  const [inputText, setInputText] = useState('')

  const handleSend = () => {
    const trimmed = inputText.trim()
    if (!trimmed) return
    onSend(trimmed)
    setInputText('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const progressDots = Array.from({ length: maxQ }, (_, i) => (
    <span
      key={i}
      className={`inline-block w-1.5 h-1.5 rounded-full ${i < askedCount ? 'bg-green-500' : 'bg-gray-300'}`}
    />
  ))

  return (
    <div className="philip-enter mt-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#fafbfd] border-b border-gray-100">
          <PhilipAvatar />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900">Philip</div>
            <div className="text-[10.5px] text-gray-400 uppercase tracking-[0.04em] font-semibold">AI Assistant</div>
          </div>
          {!showSummary && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-shrink-0">
              <span>{askedCount}/{maxQ}</span>
              <div className="flex gap-1">{progressDots}</div>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="p-4 flex flex-col gap-3">
          {messages.map((msg, i) =>
            msg.role === 'philip' ? (
              <div key={i} className="flex items-start">
                <div className="px-4 py-3 text-sm bg-[#f6f7fb] border border-[#e7e9f3] rounded-xl rounded-tl-[4px] text-gray-800 max-w-[85%]">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start justify-end">
                <div className="px-4 py-3 text-sm bg-[#3b5bdb] text-white rounded-xl rounded-tr-[4px] max-w-[85%]">
                  {msg.text}
                </div>
              </div>
            )
          )}

          {awaitingAI && <TypingIndicator />}
          {showSummary && summary && (
            <SummaryBlock summary={summary} onConfirm={onConfirm} onEdit={onEdit} awaitingConfirm={awaitingConfirm} />
          )}
          {showSummary && !summary && (
            <div className="flex items-start" data-testid="summary-error">
              <div className="w-full px-4 py-3 text-sm bg-amber-50 border border-amber-200 rounded-xl rounded-tl-[4px]">
                <p className="text-gray-800">
                  Something went wrong putting your summary together. Your request hasn&rsquo;t been sent yet.
                </p>
                <button
                  type="button"
                  onClick={onEdit}
                  className="mt-3 px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Edit my request
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Input row */}
        {!showSummary && (
          <div className="flex gap-2 px-4 pb-4">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={awaitingAI}
              placeholder="Type your reply…"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={awaitingAI}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
