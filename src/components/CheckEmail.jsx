import { useState } from 'react'
import AuthLayout from './AuthLayout.jsx'
import { resendConfirmation } from '../lib/auth.js'

/** Shown after registration — the app stays locked until the email link is clicked. */
export default function CheckEmail({ email, emailSent = true }) {
  const [state, setState] = useState(emailSent ? 'idle' : 'failed')
  const [error, setError] = useState(null)

  const handleResend = async () => {
    setState('sending')
    setError(null)
    try {
      await resendConfirmation(email)
      setState('resent')
    } catch (err) {
      setError(err.message)
      setState('idle')
    }
  }

  return (
    <AuthLayout title="Confirm your email">
      {state === 'failed' ? (
        <p className="text-sm text-gray-700">
          Your account was created, but we couldn't send the confirmation email to <strong>{email}</strong>. Use the
          button below to try again.
        </p>
      ) : (
        <p className="text-sm text-gray-700">
          We sent a confirmation email to <strong>{email}</strong>.
        </p>
      )}
      <ol className="mt-4 space-y-2 text-sm text-gray-700 list-decimal list-inside">
        <li>Open the email from OGC Deacons (check spam or promotions if you don't see it).</li>
        <li>Click <strong>Confirm my email</strong>, then the confirm button on the page that opens.</li>
        <li>You'll be signed in and can use the request form.</li>
      </ol>
      <p className="mt-4 text-xs text-gray-500">The link expires in 24 hours. You can close this tab.</p>
      <div className="mt-6">
        {state === 'resent' ? (
          <p className="text-sm text-green-700">Sent again. It may take a minute to arrive.</p>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={state === 'sending'}
            className="text-sm text-blue-600 hover:underline disabled:opacity-50"
          >
            {state === 'sending' ? 'Sending…' : 'Resend confirmation email'}
          </button>
        )}
        {error && <p role="alert" className="mt-1.5 text-sm text-red-600">{error}</p>}
      </div>
    </AuthLayout>
  )
}
