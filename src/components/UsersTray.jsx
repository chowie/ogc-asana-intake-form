import { useEffect, useState } from 'react'
import { listUsers } from '../lib/auth.js'

const STATUS = {
  active: { label: 'Active', className: 'bg-green-100 text-green-800' },
  pending: { label: 'Awaiting email confirmation', className: 'bg-amber-100 text-amber-800' },
  invited: { label: 'Invited', className: 'bg-blue-100 text-blue-800' },
  disabled: { label: 'Disabled', className: 'bg-gray-200 text-gray-700' },
}

const fmt = (ms) =>
  new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Formats a timestamp; `empty` is shown when it is missing. */
const when = (ms, empty = 'Never') => (ms ? fmt(ms) : empty)

/** Inviter-only slide-over listing every account and its invite / acceptance / login history. */
export default function UsersTray({ onClose, onSessionExpired }) {
  const [users, setUsers] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    listUsers()
      .then((r) => alive && setUsers(r.users))
      .catch((err) => {
        if (!alive) return
        if (err.status === 401) onSessionExpired()
        else setError(err.message)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="users-tray-title"
        className="relative h-full w-full max-w-md bg-white shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 id="users-tray-title" className="text-base font-semibold text-gray-900">
            Users{users ? ` (${users.length})` : ''}
          </h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:underline" autoFocus>
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {!users && !error && <p className="text-sm text-gray-500" aria-busy="true">Loading…</p>}
          {users?.length === 0 && <p className="text-sm text-gray-500">No users yet.</p>}
          {users && users.length > 0 && (
            <ul className="space-y-3">
              {users.map((u) => {
                const status = STATUS[u.status] ?? { label: u.status, className: 'bg-gray-100 text-gray-700' }
                return (
                  <li key={u.email} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                        <p className="text-xs text-gray-500 break-all">{u.email}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                      <dt className="text-gray-500">Invited</dt>
                      <dd className="text-gray-800">
                        {when(u.invitedAt, '—')}
                        {u.invitedAt && u.invitedBy ? <span className="text-gray-500"> by {u.invitedBy}</span> : null}
                      </dd>
                      <dt className="text-gray-500">Accepted</dt>
                      <dd className="text-gray-800">{when(u.acceptedAt)}</dd>
                      <dt className="text-gray-500">Last login</dt>
                      <dd className="text-gray-800">{when(u.lastLoginAt)}</dd>
                    </dl>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
