import { useState } from 'react'
import AuthLayout, { buttonClass, ErrorText } from './AuthLayout.jsx'
import { confirmEmail, redeemLoginLink } from '../lib/auth.js'

const COPY = {
  verify: { title: 'Confirm your email', cta: 'Confirm my email', busy: 'Confirming…', run: confirmEmail },
  login: { title: 'Sign in', cta: 'Sign in', busy: 'Signing in…', run: redeemLoginLink },
}

/**
 * Landing page for emailed links (/verify, /login). The token is only spent
 * on the button click — never on page load — so email security scanners that
 * pre-fetch links can't burn it.
 */
export default function ConfirmToken({ kind, token, onSignedIn, onCancel }) {
  const copy = COPY[kind]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const handleClick = async () => {
    setBusy(true)
    setError(null)
    try {
      onSignedIn(await copy.run(token))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthLayout title={copy.title}>
      <button type="button" onClick={handleClick} disabled={busy} className={buttonClass} autoFocus>
        {busy ? copy.busy : copy.cta}
      </button>
      <ErrorText>{error}</ErrorText>
      {error && (
        <button type="button" onClick={onCancel} className="mt-4 w-full text-center text-sm text-blue-600 hover:underline">
          Go to sign in
        </button>
      )}
    </AuthLayout>
  )
}
