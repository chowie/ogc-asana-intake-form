# Code Review — ogc-asana-intake-form

**Date:** 2026-05-29
**Branch:** master
**Scope:** Full codebase
**Mode:** Report-only
**Effort:** High (7 finder angles × parallel subagents, 1-vote verify)

---

## Intent

Church ministry intake form. React/Vite SPA + Netlify Functions backend. Shared-passphrase auth. Submitters pick their name from a Notion-sourced staff roster, fill in a request, then interact with "Philip" (Claude Haiku) to clarify and summarize the request before it's submitted as an Asana task with optional file attachment. All secrets server-side.

---

## Findings

### P0 — Critical

| # | File | Issue |
|---|------|-------|
| 1 | `netlify/functions/verify-passphrase.js:17` | **No rate limiting, delay, or lockout on passphrase verification.** An attacker with the function URL can fire thousands of guesses/minute. A church-style passphrase falls to a wordlist attack in seconds with zero server-side friction. Same gap enables Anthropic quota drain and Asana spam once the passphrase is obtained. |
| 2 | `netlify/functions/verify-passphrase.js:17` | **Missing `PASSPHRASE` env var causes `undefined === undefined` → full auth bypass.** If `PASSPHRASE` is absent from the environment (deploy preview, mis-config, failed rotation), `body.passphrase === process.env.PASSPHRASE` becomes `undefined === undefined = true`. Same gap exists in `create-task.js:20`, `chat.js:59`, `attach-task.js:19` — all four endpoints open to any `POST {}`. |
| 3 | `src/components/PassphraseGate.jsx:26` | **Raw plaintext passphrase stored as auth token in localStorage.** `localStorage.ogc_auth.token` is set to the actual passphrase string, then sent verbatim as `passphraseToken` on every API call. Any XSS, browser extension, or devtools inspection leaks the org-wide credential permanently — the 1-hour `expiresAt` already in the structure would have bounded a proper opaque token. |

---

### P1 — High

| # | File | Issue |
|---|------|-------|
| 4 | `src/App.jsx:76` | **Recursive `callPhilip` for `'clear'` status drops `currentFormData` — stale closure sends `null` to chat function.** `handleFormSubmit` passes `fd` explicitly on the first call, but when Philip returns `'clear'`, the recursive call at line 76 omits the third argument. `currentFormData ?? formData` resolves to `undefined ?? null = null`. Chat function receives `formData: null`, hits the `!formData` guard, returns 400. User lands in `STAGE.ERROR` even though their request was valid. Fix: pass `currentFormData` in the recursive call. |
| 5 | `src/App.jsx:114` | **`handleConfirm` has no in-flight guard — double-click creates duplicate Asana tasks.** The "Confirm & send" button has no `disabled` prop, no loading state is passed from `App.jsx`, and no `awaitingConfirm` state exists. Two rapid clicks before the first `createTask` resolves fire two independent `POST /tasks` requests. Asana has no idempotency key. Both may also attempt `attachFile`. |
| 6 | `src/App.jsx:114` | **`attachFile` failure after `createTask` succeeds transitions to `STAGE.ERROR`, hiding the created task.** Both calls share a single try/catch. If `attachFile` throws, the user sees a failure and believes nothing was submitted — but the Asana task already exists in the Inbox. Re-confirming creates a duplicate. Fix: decouple the two calls; surface the task URL even on attach failure. |
| 7 | `src/App.jsx:74` | **`callPhilip` 'clear' branch recurses with no depth limit.** If the model returns `'clear'` again on the follow-up call (possible under tool-use edge cases), recursion is unbounded — each iteration fires an Anthropic API call and the 400ms delay, while conversation history inflates input tokens with repeated copies of the follow-up message. |
| 8 | `netlify/functions/create-task.js:54` | **No `AbortSignal` timeout on any outbound fetch.** `create-task`, `attach-task`, and `chat` all make external HTTP calls with no timeout. A slow or hung upstream occupies the Lambda slot for the full 10-second function timeout, returning a generic 502 with no signal. Fix: `signal: AbortSignal.timeout(8000)` on Asana calls, `9000` on the Anthropic call. |
| 9 | `netlify/functions/attach-task.js:27` | **`taskGid` from client not validated against `ASANA_PROJECT_GID`.** The Asana PAT is workspace-scoped. An authenticated user can POST any GID in the workspace, attaching files to tasks outside the OGC Deacons project. Fix: verify task membership via preflight GET before uploading. |

---

### P2 — Moderate

| # | File | Issue |
|---|------|-------|
| 10 | `netlify/functions/chat.js:76` | **User-controlled `formData` fields interpolated directly into the Claude system prompt — prompt injection.** `formData.title`, `formData.details`, and `formData.submitterName` are embedded verbatim without delimiters or length caps. `tool_choice: { type: 'tool', name: 'respond' }` forces structured output but does not prevent a crafted `details` string from controlling all five summary fields placed into the Asana task deacons see. Fix: move user data into a user-role message wrapped in XML delimiters; add server-side length caps. |
| 11 | `netlify/functions/attach-task.js:36` | **No server-side file size or MIME validation before `Buffer.from(fileData, 'base64')`.** Netlify's 6 MB body cap partially mitigates, but an authenticated caller can reliably POST a ~6 MB base64 payload (decodes to ~4.5 MB) per request, spiking function memory synchronously. Client-side 3.5 MB check is bypassable with a direct POST. Also: `fileName` and `mimeType` are passed to Asana unvalidated — attacker-chosen MIME type on an attachment could cause content-type confusion if served inline. |
| 12 | `netlify/functions/create-task.js:30` | **Empty `summary: {}` bypasses `!summary` guard, producing literal `"undefined"` strings in task notes.** `(!details && !summary)` evaluates `!{} = false`, so validation passes. `notes` construction then accesses `summary.what`, `.context`, etc. which are all `undefined` — the Asana task notes contain five `"undefined"` tokens visible to the deacon board. |
| 13 | `src/components/PhilipChat.jsx:169` | **`showSummary=true` with `summary=null` leaves user on blank panel with no recovery.** If the server returns `status='summarized'` but `result.summary` is missing, `setSummary(null)` is called and stage becomes `SUMMARY`. `showSummary` is `true` so the chat input is hidden; `summary` is falsy so `SummaryBlock` doesn't render. No way to proceed, edit, or retry. |
| 14 | `src/App.jsx:72` | **`askedCount` has no hard cap — Philip can exceed `maxQ` clarifying questions.** The system prompt asks for summarization after 3 questions but nothing server-side enforces it. Progress dots cap visually at 3 but the chat continues indefinitely with no way to force summarization. |
| 15 | `src/App.jsx:105` | **`callPhilip` has no re-entrancy guard.** `setAwaitingAI(true)` is queued by React (not synchronously applied), so a second `handleUserSend` call can begin before `awaitingAI` reflects in state. Concurrent invocations may produce out-of-order messages or a double `SUMMARY` transition. |
| 16 | `netlify/functions/create-task.js:48` | **`followerGid` and `assigneeGid` not validated against roster.** An authenticated user can supply any workspace GID, adding non-deacons or external collaborators as task follower/assignee and triggering Asana email notifications with the submitter's name and request details. |
| 17 | `src/lib/asana.js:12` | **Base64 inflates 3.5 MB files to ~4.67 MB, approaching Netlify's 6 MB body cap.** Near the client-side ceiling, attach requests may hit plan-tier soft limits or function OOM — and this failure occurs *after* `createTask` succeeds, triggering the orphan-task cascade (finding #6). Fix: lower `MAX_FILE_BYTES` to ~700 KB or replace base64-over-JSON with direct multipart upload. |
| 18 | `scripts/fetch-roster.mjs:56` | **Silently writes an empty roster when Notion property names change.** If "Asana GID" or "Email" is renamed, every entry fails the final `.filter()` and `roster.json` is overwritten with `[]`. Build and deploy succeed; staff dropdown is empty. Fix: treat a post-filter empty array as a failure and exit non-zero when pre-filter results were non-empty. |
| 19 | `netlify/functions/chat.js:120` | **`chat.js` does not validate the `summary` object when `status` is `'summarized'`.** If Claude returns `status: 'summarized'` without the `summary` field (valid per schema — only `status` is required), `App.jsx` calls `setSummary(undefined)` and transitions to `STAGE.SUMMARY`, hitting the blank-panel condition in finding #13. Fix: validate summary shape server-side before returning 200. |
| 20 | `src/App.jsx:37` | **`callPhilip` accepts `currentStage` and `currentFormData` solely to work around React stale closures.** These parameters exist because React state is stale at call time. Future developers will trace why a chat function takes a stage argument; the function also silently behaves differently depending on which argument path is taken. |
| 21 | `src/App.jsx:137` | **`handleReset` and `handleEdit` manually reset overlapping state with no shared abstraction.** `handleEdit` is already diverged (`attachedFile` not cleared). Adding new state requires updating both functions independently. Fix: `useReducer` with RESET/EDIT actions, or group session state into a single object with a defined initial constant. |

---

### P3 — Low

| # | File | Issue |
|---|------|-------|
| 22 | `scripts/fetch-roster.mjs:44` | **No Notion pagination — silently truncates beyond 100 rows.** Notion's default page size is 100. If the database accumulates more than 100 rows (inactive members without Active checkbox), active deacons beyond position 100 are dropped. Their submissions fail server-side with 422 because `followerGid` resolves to `undefined`. |
| 23 | `src/App.jsx:158` | **`frozen` uses an implicit blocklist.** `stage !== STAGE.FORM && stage !== STAGE.ERROR` silently covers any future STAGE value — a new stage would accidentally leave the form editable. A positive allowlist fails safely. |
| 24 | `src/lib/asana.js:11` | **`localStorage` auth token read with three independent `JSON.parse` calls across four files.** Renaming the `ogc_auth` key or schema requires updating all sites. Fix: export `getAuthToken()` from `src/lib/auth.js`. |
| 25 | `src/__tests__/IntakeForm.test.jsx:107` | **`dueDate` assertion uses `.toBeFalsy()` instead of `.toBeNull()`.** The submit handler explicitly sets `dueDate: form.dueDate \|\| null`, so the value is always `null`. `.toBeFalsy()` also passes for `''` or `undefined`, masking a regression. |

---

### Testing Gaps

| # | File | Gap |
|---|------|-----|
| T1 | `src/App.jsx` | No App-level tests exist. `callPhilip` network failure, `!res.ok` branch, `'clear'` recursive path, and `handleConfirm` error paths are all dark. |
| T2 | `src/components/IntakeForm.jsx:61` | File attachment branch has zero coverage — `handleFileChange`, `clearFile`, and the 3.5 MB size gate are untested. |
| T3 | `src/App.jsx:18` | Auth expiry check (`stored.expiresAt > Date.now()`) in `useState` initializer is untested. A regression inverting the check would leave the form permanently accessible. |
| T4 | `src/App.jsx:50` | `handleNameChange` `assigneeGid` reset logic (self-assignment prevention) has no test. |
| T5 | `src/__tests__/PassphraseGate.test.jsx:81` | "Network call fails" test uses `{ ok: false }` (fetch resolves), not a true network rejection. Catch-path distinction is untested. |

---

## Recommended Fix Order

1. **P0 immediately:** Add missing-env-var guard to all four functions. Issue short-lived server-signed tokens from `verify-passphrase` instead of storing the raw passphrase. Add rate limiting (Netlify Edge Function counter or Upstash Redis).
2. **P1 before production:** Fix stale-closure `currentFormData` in recursive `callPhilip` (one-line fix). Add in-flight guard to `handleConfirm`. Decouple `createTask`/`attachFile` error handling. Add `AbortSignal.timeout` to all three server functions. Add recursion depth guard. Validate `taskGid` against project GID.
3. **P2 soon:** Move user-supplied fields out of system prompt into delimited user-role message. Add server-side size/MIME validation in `attach-task`. Validate `followerGid`/`assigneeGid` against roster. Lower `MAX_FILE_BYTES` or switch to direct-to-Asana multipart. Fix empty-roster guard in `fetch-roster.mjs`.
4. **P3 at leisure:** Extract `getAuthToken()`, add Notion pagination, fix `frozen` allowlist, fix `.toBeFalsy()` assertion.

---

## Residual Risks (Not Actionable Findings)

- Asana PAT is workspace-scoped — PAT compromise gives full workspace read/write, not just OGC Deacons.
- Anthropic API key is unscoped — abuse-driven quota exhaustion affects all projects sharing the key.
- Shared-secret auth is non-attributable — rotate passphrase on deacon turnover.
- No server-side audit log — `submitterName` and `submitterEmail` are user-typed strings, not authenticated identity.
- Roster is baked into the bundle at build time — a Notion schema rename deploys an empty roster with no build error.
