import { useEffect, useReducer, useRef, useState } from 'react'
import SignIn from './components/SignIn.jsx'
import Register from './components/Register.jsx'
import ConfirmToken from './components/ConfirmToken.jsx'
import InvitePanel from './components/InvitePanel.jsx'
import Profile from './components/Profile.jsx'
import UsersTray from './components/UsersTray.jsx'
import IntakeForm from './components/IntakeForm.jsx'
import PhilipChat from './components/PhilipChat.jsx'
import SuccessMessage from './components/SuccessMessage.jsx'
import { createTask, attachFile } from './lib/asana.js'
import { getSession, logout, parseAuthRoute } from './lib/auth.js'

const STAGE = {
  FORM: 'FORM',
  SUBMITTING: 'SUBMITTING',
  CLARIFYING: 'CLARIFYING',
  SUMMARY: 'SUMMARY',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
}

const SESSION_EXPIRED = 'Your session expired after 30 minutes of inactivity. Sign in again, then resubmit — your request is still here.'

const MAX_Q = 3
const MAX_CLEAR_DEPTH = 2

const GREETING = {
  role: 'philip',
  text: "Hi, I'm Philip — an AI assistant here to help make sure your request gets to the deacons clearly. I just have a couple of quick questions.",
  isLocal: true,
}

const INITIAL = {
  stage: STAGE.FORM,
  formData: null,
  messages: [],
  askedCount: 0,
  awaitingAI: false,
  summary: null,
  taskTitle: '',
  taskUrl: '',
  errorMsg: null,
  attachedFile: null,
  awaitingConfirm: false,
  attachFailed: false,
  emailSent: false,
}

function reducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return INITIAL
    case 'EDIT':
      // Return to the form keeping what the user already entered.
      return { ...INITIAL, formData: state.formData, attachedFile: state.attachedFile }
    case 'SET_FILE':
      return { ...state, attachedFile: action.file }
    case 'SUBMIT_FORM':
      return { ...state, formData: action.fd, messages: [GREETING], askedCount: 0, summary: null, errorMsg: null, stage: STAGE.SUBMITTING }
    case 'USER_MESSAGE':
      return { ...state, messages: [...state.messages, { role: 'user', text: action.text }] }
    case 'AI_START':
      return { ...state, awaitingAI: true, stage: STAGE.CLARIFYING }
    case 'AI_QUESTION':
      return {
        ...state,
        awaitingAI: false,
        askedCount: state.askedCount + 1,
        messages: [...state.messages, { role: 'philip', text: action.text }],
      }
    case 'AI_SUMMARY':
      return {
        ...state,
        awaitingAI: false,
        stage: STAGE.SUMMARY,
        summary: action.summary,
        messages: [...state.messages, { role: 'philip', text: action.text }],
      }
    case 'AI_IDLE':
      return { ...state, awaitingAI: false }
    case 'ERROR':
      return { ...state, awaitingAI: false, awaitingConfirm: false, stage: STAGE.ERROR, errorMsg: action.message }
    case 'CONFIRM_START':
      return { ...state, awaitingConfirm: true }
    case 'CONFIRM_RESULT':
      return {
        ...state,
        awaitingConfirm: false,
        stage: STAGE.SUCCESS,
        taskTitle: action.taskTitle,
        taskUrl: action.taskUrl,
        attachFailed: action.attachFailed,
        emailSent: action.emailSent,
      }
    default:
      return state
  }
}

export default function App() {
  // undefined = still checking, null = signed out,
  // else { email, name, firstName, lastName, canInvite, canChangeEmail, needsProfile }
  const [session, setSession] = useState(undefined)
  const [route, setRoute] = useState(parseAuthRoute) // { kind: invite|verify|login, token } | null
  const [notice, setNotice] = useState(null)
  const [showInvite, setShowInvite] = useState(false)
  const [showUsers, setShowUsers] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const {
    stage, formData, messages, askedCount, awaitingAI, summary,
    taskTitle, taskUrl, errorMsg, attachedFile, awaitingConfirm, attachFailed, emailSent,
  } = state

  // Refs hold the latest values for async/recursive reads, where reducer state
  // would be stale inside the same tick. This replaces threading stage/formData
  // through callPhilip as positional arguments.
  const formDataRef = useRef(null)
  const askedCountRef = useRef(0)
  const philipInFlight = useRef(false)
  const confirmInFlight = useRef(false)

  // Strip one-time tokens from the address bar and history as soon as we've read them.
  useEffect(() => {
    if (route) window.history.replaceState(null, '', '/')
  }, [])

  useEffect(() => {
    getSession()
      .then((s) => setSession(s.authenticated ? s : null))
      .catch(() => setSession(null))
  }, [])

  // Magic links open in a new tab. When a signed-out tab regains focus,
  // re-check the shared cookie so this tab — and its unsent request — resumes.
  useEffect(() => {
    if (session !== null || route) return
    const recheck = () => {
      if (document.visibilityState === 'hidden') return
      getSession()
        .then((s) => {
          if (s.authenticated) {
            setSession(s)
            setNotice(null)
          }
        })
        .catch(() => {})
    }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', recheck)
    return () => {
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [session, route])

  // A protected call returned 401: drop to the sign-in screen. App stays
  // mounted, so the reducer (the in-progress request) survives re-login.
  const closePanels = () => {
    setShowInvite(false)
    setShowUsers(false)
    setShowProfile(false)
  }

  const expireSession = () => {
    setSession(null)
    closePanels()
    setNotice(SESSION_EXPIRED)
  }

  const handleSignedIn = (s) => {
    setSession(s)
    setRoute(null)
    setNotice(null)
  }

  const handleSignOut = async () => {
    await logout().catch(() => {})
    setSession(null)
    closePanels()
    setNotice(null)
    formDataRef.current = null
    askedCountRef.current = 0
    dispatch({ type: 'RESET' })
  }

  // Recursive worker. Callers hold philipInFlight, so it does not re-guard.
  const runPhilip = async (apiMessages, depth = 0) => {
    dispatch({ type: 'AI_START' })

    let res
    try {
      res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData: formDataRef.current,
          messages: apiMessages,
        }),
      })
    } catch {
      dispatch({ type: 'ERROR', message: "We couldn't reach the assistant." })
      return
    }

    if (res.status === 401) {
      dispatch({ type: 'ERROR', message: SESSION_EXPIRED })
      expireSession()
      return
    }

    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      dispatch({ type: 'ERROR', message: b.error || "We couldn't reach the assistant." })
      return
    }

    const result = await res.json()
    await new Promise((r) => setTimeout(r, 400))

    const requestSummary = async () => {
      if (depth >= MAX_CLEAR_DEPTH) {
        dispatch({ type: 'ERROR', message: "We couldn't put your summary together. Please review your request and try again." })
        return
      }
      await runPhilip([...apiMessages, { role: 'user', content: 'Great — please produce the summary now.' }], depth + 1)
    }

    if (result.status === 'needs_clarification') {
      // Hard cap: once the question budget is spent, force summarization
      // instead of letting Philip ask indefinitely.
      if (askedCountRef.current >= MAX_Q) {
        await requestSummary()
      } else {
        askedCountRef.current += 1
        dispatch({ type: 'AI_QUESTION', text: result.question })
      }
    } else if (result.status === 'clear') {
      await requestSummary()
    } else if (result.status === 'summarized') {
      dispatch({
        type: 'AI_SUMMARY',
        summary: result.summary,
        text: "Got it — thank you. That's enough for me to put a clear summary together for the deacons.",
      })
    } else {
      dispatch({ type: 'AI_IDLE' })
    }
  }

  const handleFormSubmit = async (fd) => {
    if (philipInFlight.current) return
    philipInFlight.current = true
    formDataRef.current = fd
    askedCountRef.current = 0
    dispatch({ type: 'SUBMIT_FORM', fd })
    try {
      await runPhilip([])
    } finally {
      philipInFlight.current = false
    }
  }

  const handleUserSend = async (text) => {
    if (philipInFlight.current) return // re-entrancy guard — ref is synchronous, awaitingAI state is not
    philipInFlight.current = true
    dispatch({ type: 'USER_MESSAGE', text })
    const apiMsgs = [...messages, { role: 'user', text }]
      .filter((m) => !m.isLocal)
      .map((m) => ({ role: m.role === 'philip' ? 'assistant' : 'user', content: m.text }))
    try {
      await runPhilip(apiMsgs)
    } finally {
      philipInFlight.current = false
    }
  }

  const handleConfirm = async () => {
    if (confirmInFlight.current) return // in-flight guard — prevents duplicate tasks on double-click
    confirmInFlight.current = true
    dispatch({ type: 'CONFIRM_START' })

    let data
    try {
      data = await createTask({ ...formData, summary })
    } catch (err) {
      dispatch({ type: 'ERROR', message: err.status === 401 ? SESSION_EXPIRED : err.message })
      if (err.status === 401) expireSession()
      confirmInFlight.current = false
      return
    }

    // Task exists from here on — an attachment failure must not hide it or
    // trigger a re-submit, so it is surfaced as a non-fatal warning.
    let attachFailed = false
    if (attachedFile) {
      try {
        await attachFile({ taskGid: data.data.gid, file: attachedFile })
      } catch {
        attachFailed = true
      }
    }

    dispatch({
      type: 'CONFIRM_RESULT',
      taskTitle: data.data.name,
      taskUrl: data.data.permalink_url ?? '',
      attachFailed,
      emailSent: !!data.emailSent,
    })
    confirmInFlight.current = false
  }

  const handleEdit = () => {
    askedCountRef.current = 0
    dispatch({ type: 'EDIT' })
  }

  const handleReset = () => {
    formDataRef.current = null
    askedCountRef.current = 0
    dispatch({ type: 'RESET' })
  }

  if (route?.kind === 'invite') {
    return <Register inviteToken={route.token} onCancel={() => setRoute(null)} />
  }
  if (route) {
    return <ConfirmToken kind={route.kind} token={route.token} onSignedIn={handleSignedIn} onCancel={() => setRoute(null)} />
  }
  if (session === undefined) {
    return <div className="min-h-screen bg-gray-50" aria-busy="true" />
  }
  if (!session) {
    return <SignIn onSignedIn={handleSignedIn} notice={notice} />
  }
  // First sign-in: review the name the invite was created with. Later: the Profile link.
  if (session.needsProfile || showProfile) {
    return (
      <Profile
        session={session}
        onSaved={(s) => {
          setSession(s)
          setShowProfile(false)
        }}
        onCancel={() => setShowProfile(false)}
        onSessionExpired={expireSession}
      />
    )
  }

  const header = (
    <div className="w-full max-w-lg flex items-center justify-end gap-4 text-sm text-gray-500 mb-4">
      <span className="truncate" title={session.email}>{session.name || session.email}</span>
      <button type="button" onClick={() => setShowProfile(true)} className="hover:underline">Profile</button>
      {session.canInvite && (
        <>
          <button type="button" onClick={() => setShowInvite((v) => !v)} className="text-blue-600 hover:underline">
            Invite
          </button>
          <button type="button" onClick={() => setShowUsers(true)} className="text-blue-600 hover:underline">
            Users
          </button>
        </>
      )}
      <button type="button" onClick={handleSignOut} className="hover:underline">Sign out</button>
    </div>
  )

  if (stage === STAGE.SUCCESS) {
    return (
      <SuccessMessage
        taskTitle={taskTitle}
        taskUrl={taskUrl}
        attachFailed={attachFailed}
        emailSent={emailSent}
        onReset={handleReset}
      />
    )
  }

  // Positive allowlist — only these stages keep the form editable; any new
  // stage is frozen by default rather than silently editable.
  const editable = stage === STAGE.FORM || stage === STAGE.ERROR
  const frozen = !editable

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      {header}
      {showUsers && <UsersTray onClose={() => setShowUsers(false)} onSessionExpired={expireSession} />}
      <div className="w-full max-w-lg">
        {showInvite && <InvitePanel onClose={() => setShowInvite(false)} onSessionExpired={expireSession} />}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Oneida Gospel Church</h1>
          <p className="text-gray-500 mt-1">Submit a request to the Deacon board</p>
        </div>
        <IntakeForm
          initialData={formData}
          accountName={session.name}
          accountEmail={session.email}
          onSubmit={handleFormSubmit}
          onFileChange={(file) => dispatch({ type: 'SET_FILE', file })}
          frozen={frozen}
          submitting={stage === STAGE.SUBMITTING}
          apiError={stage === STAGE.ERROR ? errorMsg : null}
        />
        {(stage === STAGE.CLARIFYING || stage === STAGE.SUMMARY) && (
          <PhilipChat
            messages={messages}
            askedCount={askedCount}
            maxQ={MAX_Q}
            onSend={handleUserSend}
            awaitingAI={awaitingAI}
            showSummary={stage === STAGE.SUMMARY}
            summary={summary}
            awaitingConfirm={awaitingConfirm}
            onConfirm={handleConfirm}
            onEdit={handleEdit}
          />
        )}
      </div>
    </div>
  )
}
