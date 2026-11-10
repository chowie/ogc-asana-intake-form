import { useState } from 'react'
import AuthLayout, { buttonClass, ErrorText } from './AuthLayout.jsx'
import { confirmEmail, confirmEmailChange, redeemLoginLink } from '../lib/auth.js'

const COPY = {
  verify: { title: 'Confirm your email', cta: 'Confirm my email', busy: 'Confirming…', run: confirmEmail },
  login: { title: 'Sign in', cta: 'Sign in', busy: 'Signing in…', run: redeemLoginLink },
  emailChange: {
    title: 'Confirm email change',
    intro: 'Click below to approve the change to your sign-in email. The new address is shown in the email you just opened. If you didn’t request this, close this page and nothing will change.',
    cta: 'Yes, I requested this',
    busy: 'Approving…',
    run: confirmEmailChange,
  },
  emailVerify: {
    title: 'Confirm your new email',
    intro: 'Click below to confirm this is your new sign-in email. You’ll be signed in with it.',
    cta: 'Confirm this address',
    busy: 'Confirming…',
    run: confirmEmailChange,
  },
}

/**
 * Landing page for emailed links (/verify, /login, /email-change, /email-change-verify). The token is only spent
 * on the button click — never on page load — so email security scanners that
 * pre-fetch links can't burn it.
 */
export default function ConfirmToken({ kind, token, onSignedIn, onCancel }) {
  const copy = COPY[kind]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [approvedFor, setApprovedFor] = useState(null) // email-change step 1 done

  const handleClick = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await copy.run(token)
      if (res.approved) {
        setApprovedFor(res.sentTo)
        return
      }
      onSignedIn(res)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (approvedFor) {
    return (
      <AuthLayout title="Approved — one more step">
        <p role="status" className="text-sm text-gray-700">
          We sent a confirmation link to your new address, <strong>{approvedFor}</strong>. Open it and click{' '}
          <strong>Confirm this address</strong> to finish. The link expires in 1 hour. You can close this tab.
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={copy.title}>
      {copy.intro && <p className="text-sm text-gray-700 mb-4">{copy.intro}</p>}
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
