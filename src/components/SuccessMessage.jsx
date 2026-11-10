export default function SuccessMessage({ taskTitle, taskUrl, attachFailed, emailSent, onReset }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-sm p-8 text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-lg font-semibold text-gray-900">Request sent to the deacons</h2>
        <p className="text-sm text-gray-500 mt-2">
          A task has been created in Asana with your clarified summary.
        </p>

        {taskTitle && (
          <div className="mt-3">
            {taskUrl ? (
              <a
                href={taskUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-[#d1fae5] text-[#065f46] text-xs font-medium px-3 py-1.5 rounded-full hover:bg-[#a7f3d0] transition-colors"
              >
                Asana task · &ldquo;{taskTitle}&rdquo;
              </a>
            ) : (
              <span className="inline-block bg-[#d1fae5] text-[#065f46] text-xs font-medium px-3 py-1.5 rounded-full">
                Asana task · &ldquo;{taskTitle}&rdquo;
              </span>
            )}
          </div>
        )}

        {taskUrl && (
          <div className="mt-5 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-left text-sm text-gray-700">
            <p className="font-medium text-gray-900">Want updates on this request?</p>
            <p className="mt-1">
              <a href={taskUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Open the task in Asana
              </a>{' '}
              and click <strong>Follow</strong>.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              You&rsquo;ll need a free Asana account. The first time, Asana may ask you to <em>Request access</em> &mdash;
              a deacon will approve it.
            </p>
            {emailSent && <p className="mt-2 text-xs text-gray-500">We&rsquo;ve also emailed you this link.</p>}
          </div>
        )}

        {attachFailed && (
          <p role="alert" className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Your request was submitted, but the attached file couldn&rsquo;t be uploaded. You can reply to the Asana task to add it.
          </p>
        )}

        <button
          onClick={onReset}
          className="mt-6 w-full border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium py-2 rounded-lg transition-colors"
        >
          Submit Another Request
        </button>
      </div>
    </div>
  )
}
