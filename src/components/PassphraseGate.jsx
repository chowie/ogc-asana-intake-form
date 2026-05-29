import { useState } from 'react'
import { setAuth } from '../lib/auth.js'

export default function PassphraseGate({ onAuthenticated }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setChecking(true)
    setError(false)

    try {
      const res = await fetch('/.netlify/functions/verify-passphrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: input }),
      })

      if (!res.ok) throw new Error('Server error')

      const { valid, token, expiresAt } = await res.json()

      if (valid && token) {
        setAuth({ token, expiresAt })
        onAuthenticated()
      } else {
        setError(true)
        setInput('')
      }
    } catch {
      setError(true)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Oneida Gospel Church</h1>
          <p className="text-sm text-gray-500 mt-1">Deacon Board Request Form</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="passphrase" className="block text-sm font-medium text-gray-700 mb-1">
              Passphrase
            </label>
            <input
              id="passphrase"
              type="password"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setError(false)
              }}
              placeholder="Enter passphrase"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              disabled={checking}
            />
            {error && (
              <p role="alert" className="mt-1.5 text-sm text-red-600">
                Incorrect passphrase. Please try again.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={checking}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {checking ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
