import { requireAuth } from './_shared/auth.js'
import { limit } from './_shared/rate-limit.js'

const SYSTEM_PROMPT_BASE = `You are Philip, a warm and helpful AI assistant for Oneida Gospel Church. Your job is to make sure requests submitted to the Deacon board are clear, specific, and actionable — so the deacons have everything they need to help without having to chase down missing details. You ask one short, plain-language question at a time. You never use jargon or overly formal language. You are patient and encouraging.

You will receive the form submission (name, request title, request details, and optional due date). Analyze whether the request gives the deacons enough information to act: what is needed, who needs it, what the desired outcome looks like, and any timing or constraints.

Always call the respond tool with one of these statuses:
- "clear" — the request is already specific and actionable, no clarification needed
- "needs_clarification" — you need one more piece of information (include the question)
- "summarized" — you have enough information to write the final brief (include the summary)

After receiving clarifying answers (or after 3 questions maximum), produce a structured summary. Write it in plain, friendly language as if you are handing off a clear brief to the deacon team. The summary will be shown to the user for confirmation before anything is submitted.`

const RESPOND_TOOL = {
  name: 'respond',
  description: 'Respond to the intake request analysis.',
  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['clear', 'needs_clarification', 'summarized'],
      },
      question: {
        type: 'string',
        description: 'Required when status is needs_clarification. A single plain-language question.',
      },
      summary: {
        type: 'object',
        description: 'Required when status is summarized.',
        properties: {
          what: { type: 'string' },
          context: { type: 'string' },
          scope: { type: 'string' },
          constraints: { type: 'string' },
          definition_of_done: { type: 'string' },
        },
        required: ['what', 'context', 'scope', 'constraints', 'definition_of_done'],
      },
    },
    required: ['status'],
  },
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON' }),
    }
  }

  const forbidden = requireAuth(body)
  if (forbidden) return forbidden

  const limited = await limit(event, { id: 'chat', max: 20, windowSec: 60 })
  if (limited) return limited

  const { formData, messages } = body
  if (!formData || !Array.isArray(messages)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Your request could not be sent. Please refresh the page and try again.' }),
    }
  }

  const systemPrompt = `${SYSTEM_PROMPT_BASE}

The user submitted the following form:
Request title: ${formData.title}
Request details: ${formData.details}
Due date: ${formData.dueDate || 'not specified'}
Submitted by: ${formData.submitterName}`

  let claudeRes
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools: [RESPOND_TOOL],
        tool_choice: { type: 'tool', name: 'respond' },
        messages: messages.length > 0 ? messages : [{ role: 'user', content: 'Please begin.' }],
      }),
      signal: AbortSignal.timeout(9000),
    })
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError'
    return {
      statusCode: timedOut ? 504 : 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: timedOut ? 'The assistant took too long to respond. Please try again.' : 'Failed to reach Claude API' }),
    }
  }

  if (!claudeRes.ok) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Claude API returned an error' }),
    }
  }

  const claudeData = await claudeRes.json()
  const toolUse = claudeData.content?.find((b) => b.type === 'tool_use' && b.name === 'respond')
  const parsed = toolUse?.input ?? null

  if (!parsed || !parsed.status) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unexpected response from assistant' }),
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  }
}
