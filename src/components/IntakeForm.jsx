import { useEffect, useState } from 'react'
import { STAFF, findStaff } from '../config/staff.js'

const BLANK = { name: '', email: '', title: '', details: '', dueDate: '', assigneeGid: '' }
const MAX_FILE_BYTES = 3.5 * 1024 * 1024
const ACCEPTED_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg'

function validate(form) {
  const errs = {}
  if (!form.name) errs.name = 'Please select your name.'
  if (!form.title.trim()) errs.title = 'Request title is required.'
  if (!form.details.trim()) errs.details = 'Request details are required.'
  return errs
}

export default function IntakeForm({ onSubmit, onFileChange, frozen, submitting, apiError, initialData }) {
  const [form, setForm] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('ogc_last_submitter') ?? 'null')
      if (stored?.name) return { ...BLANK, name: stored.name, email: stored.email ?? '' }
    } catch {}
    return BLANK
  })
  const [errors, setErrors] = useState({})
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileError, setFileError] = useState(null)

  useEffect(() => {
    if (initialData) {
      setForm((prev) => ({
        ...prev,
        name: initialData.submitterName ?? prev.name,
        email: initialData.submitterEmail ?? prev.email,
        title: initialData.title ?? prev.title,
        details: initialData.details ?? prev.details,
        dueDate: initialData.dueDate ?? prev.dueDate,
        assigneeGid: initialData.assigneeGid ?? prev.assigneeGid,
      }))
    }
  }, [initialData])

  const handleNameChange = (e) => {
    const name = e.target.value
    const staff = findStaff(name)
    const email = staff ? staff.email : ''
    setForm((prev) => ({
      ...prev,
      name,
      email,
      assigneeGid: prev.assigneeGid === staff?.asanaGid ? '' : prev.assigneeGid,
    }))
    if (name) localStorage.setItem('ogc_last_submitter', JSON.stringify({ name, email }))
    setErrors((prev) => ({ ...prev, name: undefined }))
  }

  const handleField = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] ?? null
    if (file && file.size > MAX_FILE_BYTES) {
      setFileError('File must be 3.5 MB or smaller.')
      setSelectedFile(null)
      onFileChange?.(null)
      e.target.value = ''
      return
    }
    setFileError(null)
    setSelectedFile(file)
    onFileChange?.(file)
  }

  const clearFile = () => {
    setSelectedFile(null)
    setFileError(null)
    onFileChange?.(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    const staff = findStaff(form.name)
    onSubmit({
      submitterName: form.name,
      submitterEmail: form.email,
      title: form.title,
      details: form.details,
      dueDate: form.dueDate || null,
      followerGid: staff?.asanaGid,
      assigneeGid: form.assigneeGid || null,
    })
  }

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 transition-opacity${frozen ? ' opacity-60' : ''}`}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <fieldset disabled={frozen} className="contents">

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Your Name <span className="text-red-500">*</span>
            </label>
            <select
              id="name"
              value={form.name}
              onChange={handleNameChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">— Select your name —</option>
              {STAFF.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Your Email
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={handleField('email')}
              placeholder="your@email.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Request Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={form.title}
              onChange={handleField('title')}
              placeholder="Brief summary of your request"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
          </div>

          {/* Details */}
          <div>
            <label htmlFor="details" className="block text-sm font-medium text-gray-700 mb-1">
              Request Details <span className="text-red-500">*</span>
            </label>
            <textarea
              id="details"
              value={form.details}
              onChange={handleField('details')}
              rows={5}
              placeholder="Describe your request in as much detail as helpful…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            />
            {errors.details && <p className="mt-1 text-sm text-red-600">{errors.details}</p>}
          </div>

          {/* Due Date */}
          <div>
            <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1">
              Due Date <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="dueDate"
              type="date"
              value={form.dueDate}
              onChange={handleField('dueDate')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Assignee */}
          <div>
            <label htmlFor="assignee" className="block text-sm font-medium text-gray-700 mb-1">
              Assign to <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              id="assignee"
              value={form.assigneeGid}
              onChange={handleField('assigneeGid')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">— Unassigned —</option>
              {STAFF.filter((s) => s.name !== form.name).map((s) => (
                <option key={s.asanaGid} value={s.asanaGid}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Attachment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supporting Document <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            {selectedFile ? (
              <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50">
                <span className="flex-1 truncate text-gray-700">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={clearFile}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                  aria-label="Remove file"
                >
                  ✕
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept={ACCEPTED_TYPES}
                onChange={handleFileChange}
                className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            )}
            {fileError && <p className="mt-1 text-sm text-red-600">{fileError}</p>}
            <p className="mt-1 text-xs text-gray-400">PDF, Word, Excel, or image · max 3.5 MB</p>
          </div>

        </fieldset>

        {apiError && (
          <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <button
          type="submit"
          disabled={frozen || submitting}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
        >
          {submitting ? 'Reviewing your request…' : 'Submit Request'}
        </button>
      </form>
    </div>
  )
}
