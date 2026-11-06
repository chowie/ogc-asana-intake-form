import { useState } from 'react'
import { createInvite } from '../lib/auth.js'
import { ErrorText, inputClass } from './AuthLayout.jsx'

/** Inviter-only panel: create a one-time, 48-hour invite link. */
export default function InvitePanel({ onClose, onSessionExpired }) {
  const [email, setEmail] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { email, link, expiresAt, emailSent }
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const res = await createInvite(email, sendEmail)
      setResult({ ...res, email: email.trim(), requestedEmail: sendEmail })
      setEmail('')
    } catch (err) {
      if (err.status === 401) return onSessionExpired()
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.link)
      setCopied(true)
    } catch {
      setError('Copy failed. Select the link and copy it manually.')
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Invite someone</h2>
        <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:underline">Close</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 mb-1">Their email</label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            disabled={busy}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} disabled={busy} />
          Email the invite to them for me
        </label>
        <button
          type="submit"
          disabled={busy}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          {busy ? 'Creating…' : 'Create invite'}
        </button>
        <ErrorText>{error}</ErrorText>
      </form>

      {result && (
        <div className="mt-5 rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm">
          <p className="text-gray-700">
            {result.emailSent
              ? <>Invite emailed to <strong>{result.email}</strong>. You can also share the link yourself:</>
              : result.requestedEmail
                ? <>We couldn't email <strong>{result.email}</strong>. Copy the link and send it yourself:</>
                : <>Invite for <strong>{result.email}</strong>. Copy the link and send it however you like:</>}
          </p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={result.link} aria-label="Invite link" className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.target.select()} />
            <button type="button" onClick={handleCopy} className="shrink-0 border border-gray-300 rounded-lg px-3 text-sm hover:bg-gray-100">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Works once, and only for {result.email}. Expires {new Date(result.expiresAt).toLocaleString()}.
          </p>
        </div>
      )}
    </div>
  )
}
