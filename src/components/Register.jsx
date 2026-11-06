import { useState } from 'react'
import AuthLayout, { buttonClass, Divider, ErrorText, inputClass } from './AuthLayout.jsx'
import GoogleButton, { googleEnabled } from './GoogleButton.jsx'
import CheckEmail from './CheckEmail.jsx'
import { registerWithEmail, registerWithGoogle } from '../lib/auth.js'

/** Invite landing page (/invite?token=…). */
export default function Register({ inviteToken, onCancel }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(null) // { email, emailSent }

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fn()
      setPending({ email: res.email, emailSent: res.emailSent })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (pending) return <CheckEmail email={pending.email} emailSent={pending.emailSent} />

  return (
    <AuthLayout title="Accept your invitation">
      <p className="text-sm text-gray-700 mb-4">
        Enter the email address this invitation was sent to, or continue with the Google account for that address.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); run(() => registerWithEmail(inviteToken, email)) }} className="space-y-4">
        <div>
          <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="register-email"
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
          {busy ? 'Registering…' : 'Register'}
        </button>
      </form>
      {googleEnabled() && (
        <>
          <Divider />
          <GoogleButton text="signup_with" onCredential={(c) => run(() => registerWithGoogle(inviteToken, c))} />
        </>
      )}
      <button type="button" onClick={onCancel} className="mt-6 w-full text-center text-xs text-gray-500 hover:underline">
        Already registered? Sign in
      </button>
    </AuthLayout>
  )
}
