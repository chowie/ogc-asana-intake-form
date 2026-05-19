**Claude Code Prompt: Add AI Request Clarifier to OGC Asana Intake Form**

You are working in an existing project at `ogc-asana-intake-form`. Do not scaffold a new project. Read the existing codebase first to understand the current structure, component patterns, styling conventions, and how the Asana API call is made before writing any code.

---

**Goal**

Modify the existing intake form to include an AI-powered clarification step between form submission and Asana task creation. The user fills out the form as normal, but instead of immediately creating an Asana task, the submission triggers an AI analysis loop that ensures the request is clear and actionable before the task is created.

---

**Flow**

1. User passes the passphrase screen (existing — do not change)
2. User fills out the form: Name, Email, Request Title, Request Details, Due Date (existing — do not change the fields or layout)
3. User clicks "Submit Request"
4. The form freezes (all fields disabled, button shows a loading state)
5. The form's submitted data is sent to the Claude API for analysis
6. **If the request is already clear and actionable:** skip straight to step 9
7. **If the request needs clarification:** a chat panel slides in below the frozen form. The AI asks one clarifying question at a time. The user types responses in a text input and hits Enter or a Send button. Maximum 3 clarifying questions — after that, proceed regardless.
8. After each user response, the AI either asks the next question or, when satisfied (or at the 3-question cap), moves to step 9
9. The AI produces a structured confirmation summary:
   - **What you're asking for** (one sentence)
   - **Context / background**
   - **Scope / what's included**
   - **Any constraints or timing**
   - **Definition of done** (how will we know this is complete?)
10. The summary is displayed in the chat panel with two buttons: **"Yes, submit this"** and **"Edit my request"**
11. **"Yes, submit this"** → create the Asana task using the clarified summary as the task description, then show a success state
12. **"Edit my request"** → unfreeze the form, clear the chat panel, let the user revise and resubmit

---

**Asana Task Creation**

Use the clarified summary (not the raw Request Details) as the task description. The task should still use the Name, Email, Request Title, and Due Date from the original form fields. Match whatever pattern the existing code uses for the Asana API call — do not change the project GID, section GID, or auth approach.

---

**Claude API Integration**

- Use `fetch` to call `https://api.anthropic.com/v1/messages` directly from the client (same pattern as the existing Asana calls — no backend)
- Model: `claude-sonnet-4-20250514`
- API key: read from the existing env var pattern in the project (check `.env.example` or existing env usage — likely `VITE_` prefixed). Add `VITE_ANTHROPIC_API_KEY` if it doesn't exist yet, and add it to `.env.example` with a placeholder value
- The system prompt for the AI should be:

> You are a helpful assistant for Oneida Gospel Church. Your job is to ensure requests submitted to the Deacon board are clear, specific, and actionable. You will receive a request title and details. Analyze whether the request gives the deacons enough information to act on it: who needs what, what the desired outcome is, and any relevant constraints or timing. If the request is already clear and actionable, respond with JSON: `{"status": "clear"}`. If you need clarification, respond with JSON: `{"status": "needs_clarification", "question": "your single clarifying question here"}`. After receiving clarifying answers (or after 3 questions maximum), produce a structured summary and respond with JSON: `{"status": "summarized", "summary": {"what": "...", "context": "...", "scope": "...", "constraints": "...", "definition_of_done": "..."}}`. Always respond with valid JSON only — no prose, no markdown.

- Maintain a conversation history array across the clarification loop so each API call includes the full context of the exchange
- Handle API errors gracefully — if the Claude call fails, show an inline error and unfreeze the form so the user isn't stuck

---

**UI / Styling**

- Match the existing component and styling patterns exactly (Tailwind classes, color palette, button styles, form element styles)
- The chat panel should slide in smoothly below the form card — not a modal, not a full page swap
- Chat panel should show: the AI's question in a distinct bubble, a text input for the user's response, and a Send button
- The confirmation summary should be displayed in a clean card with clear labels for each section
- "Yes, submit this" should use the same primary button style as the existing Submit button
- "Edit my request" should be a ghost/outline button
- On success, show the same success state the existing form already uses (or match its style if there isn't one)

---

**Testing**

- Add Vitest unit tests for: the AI response parsing logic, the conversation history management, the 3-question cap enforcement, and the transition between clarification and summary states
- Add a test for the "Edit my request" path (form reset and chat panel clearing)
- Mock the Claude API and Asana API calls in tests — do not make real API calls in the test suite
- Place tests alongside existing test files, following whatever naming convention is already in use

---

**What NOT to do**

- Do not change the passphrase screen
- Do not change the form fields, layout, or validation
- Do not change the Asana project GID, section GID, or auth approach
- Do not introduce a backend or serverless function — all calls are client-side
- Do not use a modal or route change for the clarification UI
- Do not exceed 3 clarifying questions

---

Run the existing test suite before you start and after you finish. If any pre-existing tests are failing before you touch anything, flag it and stop — don't proceed until I confirm how to handle it.

---

That's the full prompt. A few things to do before you hand it to CC:

1. **Add `VITE_ANTHROPIC_API_KEY` to your `.env`** on the Netlify project (same place you set `VITE_ASANA_PAT` or whatever the token var is called)
2. **Note the API key exposure caveat** — same situation as the Asana token: it'll be in client-side JS, visible in devtools. For three known staff members behind a passphrase it's acceptable risk, but scope the key in the Anthropic Console to minimal permissions if that option exists
3. After CC ships it, do a manual pass with Bonnie in mind — make sure the chat panel questions read warm and plain, not robotic
