import { useState } from 'react'
import AuthLayout, { buttonClass, ErrorText, inputClass } from './AuthLayout.jsx'
import { requestEmailChange, saveProfile } from '../lib/auth.js'

const label = 'block text-sm font-medium text-gray-700 mb-1'

/**
 * Review / edit your name — shown once after first sign-in (onboarding) and
 * any time from the "Profile" header link. Non-Google, non-inviter accounts
 * can also request an email change, confirmed from the CURRENT inbox.
 */
export default function Profile({ session, onSaved, onCancel, onSessionExpired }) {
  const onboarding = session.needsProfile
  const [firstName, setFirstName] = useState(session.firstName ?? '')
  const [lastName, setLastName] = useState(session.lastName ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSaved(await saveProfile(firstName, lastName))
    } catch (err) {
      if (err.status === 401) return onSessionExpired()
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthLayout title={onboarding ? 'Welcome! Please check your details' : 'Your profile'}>
      {onboarding && (
        <p className="text-sm text-gray-700 mb-4">
          This is the name the deacons will see on your requests. Fix any misspellings before you continue.
        </p>
      )}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="profile-first" className={label}>First name</label>
          <input
            id="profile-first"
            type="text"
            required
            maxLength={50}
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
            disabled={busy}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="profile-last" className={label}>Last name</label>
          <input
            id="profile-last"
            type="text"
            required
            maxLength={50}
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputClass}
            disabled={busy}
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Saving…' : onboarding ? 'Save and continue' : 'Save'}
        </button>
      </form>

      <EmailSection session={session} onSessionExpired={onSessionExpired} />

      {!onboarding && (
        <button type="button" onClick={onCancel} className="mt-6 w-full text-center text-sm text-gray-500 hover:underline">
          Back to the request form
        </button>
      )}
    </AuthLayout>
  )
}

function EmailSection({ session, onSessionExpired }) {
  const [open, setOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sentTo, setSentTo] = useState(null)

  const wrap = (children) => (
    <div className="mt-6 pt-5 border-t border-gray-200">
      <p className="text-sm font-medium text-gray-700">Sign-in email</p>
      <p className="text-sm text-gray-900 mt-0.5 break-all">{session.email}</p>
      {children}
    </div>
  )

  if (!session.canChangeEmail) {
    return wrap(
      <p className="mt-2 text-xs text-gray-500">
        {session.canInvite
          ? 'Inviter email addresses are set in the site configuration. Ask the site administrator to change it.'
          : 'You sign in with Google, so your email follows your Google account.'}
      </p>,
    )
  }

  if (sentTo) {
    return wrap(
      <p role="status" className="mt-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
        To protect your account, we sent a confirmation link to your current address, <strong>{sentTo}</strong>. Open it
        and click <strong>Yes, I requested this</strong>. We&rsquo;ll then email a second link to your new address to
        confirm it&rsquo;s yours; your email changes once you click it. Each link expires in 1 hour.
      </p>,
    )
  }

  if (!open) {
    return wrap(
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm text-blue-600 hover:underline">
        Use a different email address
      </button>,
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (newEmail.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      setError('The two email addresses don’t match.')
      return
    }
    setBusy(true)
    try {
      const res = await requestEmailChange(newEmail)
      setSentTo(res.to ?? session.email)
    } catch (err) {
      if (err.status === 401) return onSessionExpired()
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return wrap(
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <p className="text-xs text-gray-500">
        First you&rsquo;ll approve the change from your <strong>current</strong> address, then confirm the new address
        from its inbox. Nothing changes until both are done.
      </p>
      <div>
        <label htmlFor="new-email" className={label}>New email</label>
        <input
          id="new-email"
          type="email"
          required
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className={inputClass}
          disabled={busy}
        />
      </div>
      <div>
        <label htmlFor="confirm-email" className={label}>Confirm new email</label>
        <input
          id="confirm-email"
          type="email"
          required
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          className={inputClass}
          disabled={busy}
        />
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Sending…' : 'Send confirmation'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          className="shrink-0 border border-gray-300 rounded-lg px-3 text-sm hover:bg-gray-50"
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>,
  )
}
