import { useState } from 'react'
import AuthLayout, { buttonClass, Divider, ErrorText, inputClass } from './AuthLayout.jsx'
import GoogleButton, { googleEnabled } from './GoogleButton.jsx'
import { requestLoginLink, signInWithGoogle } from '../lib/auth.js'

export default function SignIn({ onSignedIn, notice }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sentTo, setSentTo] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await requestLoginLink(email)
      setSentTo(email.trim())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = async (credential) => {
    setError(null)
    try {
      onSignedIn(await signInWithGoogle(credential))
    } catch (err) {
      setError(err.message)
    }
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <p className="text-sm text-gray-700">
          If <strong>{sentTo}</strong> has an account, we've sent it a sign-in link. The link works once and
          expires in 15 minutes.
        </p>
        <button type="button" onClick={() => setSentTo(null)} className="mt-6 text-sm text-blue-600 hover:underline">
          Use a different email
        </button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Deacon Board Request Form">
      {notice && <p className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">{notice}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="signin-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="signin-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
            autoFocus
            disabled={busy}
          />
          <ErrorText>{error}</ErrorText>
        </div>
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>
      {googleEnabled() && (
        <>
          <Divider />
          <GoogleButton onCredential={handleGoogle} />
        </>
      )}
      <p className="mt-6 text-xs text-gray-500 text-center">Access is by invitation. Ask a deacon if you need an account.</p>
    </AuthLayout>
  )
}
