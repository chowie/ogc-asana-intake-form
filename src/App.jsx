import { useState } from 'react'
import PassphraseGate from './components/PassphraseGate.jsx'
import IntakeForm from './components/IntakeForm.jsx'
import PhilipChat from './components/PhilipChat.jsx'
import SuccessMessage from './components/SuccessMessage.jsx'
import { createTask, attachFile } from './lib/asana.js'
import { getAuthToken, isAuthValid } from './lib/auth.js'

const STAGE = {
  FORM: 'FORM',
  SUBMITTING: 'SUBMITTING',
  CLARIFYING: 'CLARIFYING',
  SUMMARY: 'SUMMARY',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(isAuthValid)
  const [stage, setStage] = useState(STAGE.FORM)
  const [formData, setFormData] = useState(null)
  const [messages, setMessages] = useState([])
  const [askedCount, setAskedCount] = useState(0)
  const [awaitingAI, setAwaitingAI] = useState(false)
  const [summary, setSummary] = useState(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskUrl, setTaskUrl] = useState('')
  const [errorMsg, setErrorMsg] = useState(null)
  const [attachedFile, setAttachedFile] = useState(null)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const [attachFailed, setAttachFailed] = useState(false)

  const MAX_CLEAR_DEPTH = 2

  const callPhilip = async (apiMessages, currentStage, currentFormData, depth = 0) => {
    setAwaitingAI(true)
    if ((currentStage ?? stage) !== STAGE.CLARIFYING) setStage(STAGE.CLARIFYING)

    let res
    try {
      res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData: currentFormData ?? formData,
          messages: apiMessages,
          passphraseToken: getAuthToken(),
        }),
      })
    } catch {
      setErrorMsg("We couldn't reach the assistant.")
      setStage(STAGE.ERROR)
      setAwaitingAI(false)
      return
    }

    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      setErrorMsg(b.error || "We couldn't reach the assistant.")
      setStage(STAGE.ERROR)
      setAwaitingAI(false)
      return
    }

    const result = await res.json()
    await new Promise((r) => setTimeout(r, 400))

    if (result.status === 'needs_clarification') {
      setMessages((m) => [...m, { role: 'philip', text: result.question }])
      setAskedCount((c) => c + 1)
      setAwaitingAI(false)
    } else if (result.status === 'clear') {
      if (depth >= MAX_CLEAR_DEPTH) {
        setErrorMsg("We couldn't put your summary together. Please review your request and try again.")
        setStage(STAGE.ERROR)
        setAwaitingAI(false)
        return
      }
      setAwaitingAI(false)
      await callPhilip(
        [...apiMessages, { role: 'user', content: 'Great — please produce the summary now.' }],
        STAGE.CLARIFYING,
        currentFormData ?? formData,
        depth + 1
      )
    } else if (result.status === 'summarized') {
      setMessages((m) => [
        ...m,
        { role: 'philip', text: "Got it — thank you. That's enough for me to put a clear summary together for the deacons." },
      ])
      setSummary(result.summary)
      setStage(STAGE.SUMMARY)
      setAwaitingAI(false)
    } else {
      setAwaitingAI(false)
    }
  }

  const handleFormSubmit = async (fd) => {
    const greeting = {
      role: 'philip',
      text: "Hi, I'm Philip — an AI assistant here to help make sure your request gets to the deacons clearly. I just have a couple of quick questions.",
      isLocal: true,
    }
    setFormData(fd)
    setMessages([greeting])
    setStage(STAGE.SUBMITTING)
    await callPhilip([], STAGE.SUBMITTING, fd)
  }

  const handleUserSend = async (text) => {
    const userMsg = { role: 'user', text }
    setMessages((m) => [...m, userMsg])
    const apiMsgs = [...messages, userMsg]
      .filter((m) => !m.isLocal)
      .map((m) => ({ role: m.role === 'philip' ? 'assistant' : 'user', content: m.text }))
    await callPhilip(apiMsgs, STAGE.CLARIFYING)
  }

  const handleConfirm = async () => {
    if (awaitingConfirm) return // in-flight guard — prevents duplicate tasks on double-click
    setAwaitingConfirm(true)

    let data
    try {
      data = await createTask({ ...formData, summary })
    } catch (err) {
      setErrorMsg(err.message)
      setStage(STAGE.ERROR)
      setAwaitingConfirm(false)
      return
    }

    // Task exists from here on — an attachment failure must not hide it or
    // trigger a re-submit, so it is handled separately and surfaced as a warning.
    setTaskTitle(data.data.name)
    setTaskUrl(data.data.permalink_url ?? '')

    if (attachedFile) {
      try {
        await attachFile({ taskGid: data.data.gid, file: attachedFile })
      } catch {
        setAttachFailed(true)
      }
    }

    setStage(STAGE.SUCCESS)
    setAwaitingConfirm(false)
  }

  const handleEdit = () => {
    setStage(STAGE.FORM)
    setMessages([])
    setAskedCount(0)
    setSummary(null)
    setErrorMsg(null)
  }

  const handleReset = () => {
    setStage(STAGE.FORM)
    setFormData(null)
    setMessages([])
    setAskedCount(0)
    setAwaitingAI(false)
    setSummary(null)
    setTaskTitle('')
    setTaskUrl('')
    setErrorMsg(null)
    setAttachedFile(null)
    setAwaitingConfirm(false)
    setAttachFailed(false)
  }

  if (!authenticated) {
    return <PassphraseGate onAuthenticated={() => setAuthenticated(true)} />
  }

  if (stage === STAGE.SUCCESS) {
    return (
      <SuccessMessage
        taskTitle={taskTitle}
        taskUrl={taskUrl}
        attachFailed={attachFailed}
        onReset={handleReset}
      />
    )
  }

  const frozen = stage !== STAGE.FORM && stage !== STAGE.ERROR

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Oneida Gospel Church</h1>
          <p className="text-gray-500 mt-1">Submit a request to the Deacon board</p>
        </div>
        <IntakeForm
          initialData={formData}
          onSubmit={handleFormSubmit}
          onFileChange={setAttachedFile}
          frozen={frozen}
          submitting={stage === STAGE.SUBMITTING}
          apiError={stage === STAGE.ERROR ? errorMsg : null}
        />
        {(stage === STAGE.CLARIFYING || stage === STAGE.SUMMARY) && (
          <PhilipChat
            messages={messages}
            askedCount={askedCount}
            maxQ={3}
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
