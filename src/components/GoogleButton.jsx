import { useEffect, useRef } from 'react'

const SRC = 'https://accounts.google.com/gsi/client'
let scriptPromise = null

function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = resolve
    s.onerror = () => {
      scriptPromise = null
      reject(new Error('Failed to load Google sign-in'))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

/**
 * "Sign in with Google" button (Google Identity Services). Calls
 * onCredential(idToken); the server verifies it. Renders nothing when
 * VITE_GOOGLE_CLIENT_ID is unset, so email-only setups still work.
 */
export default function GoogleButton({ onCredential, text = 'signin_with' }) {
  const ref = useRef(null)
  const cb = useRef(onCredential)
  cb.current = onCredential
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !ref.current) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => cb.current(r.credential),
        })
        window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', width: 288, text })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clientId, text])

  if (!clientId) return null
  return <div ref={ref} className="flex justify-center" data-testid="google-button" />
}

export const googleEnabled = () => !!import.meta.env.VITE_GOOGLE_CLIENT_ID
