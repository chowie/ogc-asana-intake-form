export default function AuthLayout({ title, children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Oneida Gospel Church</h1>
          <p className="text-sm text-gray-500 mt-1">{title}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

export const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
export const buttonClass =
  'w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg transition-colors'

export function ErrorText({ children }) {
  return children ? <p role="alert" className="mt-1.5 text-sm text-red-600">{children}</p> : null
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400">or</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}
