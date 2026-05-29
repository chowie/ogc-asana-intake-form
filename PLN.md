# Remediation Plan — ogc-asana-intake-form

> On approval, this content is written to `./PLN.md` (the requested deliverable).

## Context

A full code review (`CODE_REVIEW.md`, 2026-05-29) found 25 findings (P0–P3) plus 5 testing gaps in this church intake-form app (React/Vite SPA + Netlify Functions, shared-passphrase auth). Three are critical auth holes: no rate limiting, a missing-env-var auth bypass (`undefined === undefined`), and the raw passphrase stored client-side as the API token. Goal: close every finding, hardening auth and decoupling the fragile submit flow, while adding the missing test coverage.

**Decisions (confirmed with user):** cover all 25 findings + test gaps · rate limiting via Upstash Redis · replace raw-passphrase token with a server-signed opaque session token (`node:crypto`, no new deps for the token itself).

---

## New shared modules

**`netlify/functions/_shared/auth.js`** (new) — stateless signed token.
- `issueToken(ttlMs = 3600_000)` → `${exp}.${nonce}.${hmacSHA256(`${exp}.${nonce}`, AUTH_SECRET)}` (base64url).
- `verifyToken(token)` → boolean: recompute HMAC, `crypto.timingSafeEqual`, and `exp > Date.now()`. Returns `false` for empty/malformed — this closes the `undefined === undefined` bypass (#2) because no valid token can be forged without `AUTH_SECRET`.
- `requireAuth(body)` helper → returns a 403 response object or `null`. Replaces the `body.passphraseToken !== process.env.PASSPHRASE` line in all three protected functions.
- Guards: throw/500 if `AUTH_SECRET` unset.

**`netlify/functions/_shared/rate-limit.js`** (new) — Upstash.
- Uses `@upstash/ratelimit` + `@upstash/redis` (new deps). Env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- `limit(event, { id, max, windowSec })` keyed by client IP (`x-nf-client-connection-ip`, fallback `x-forwarded-for`). Returns 429 response object or `null`.
- Fail-open if Upstash env unset (log warn) so local `netlify dev` works without Redis.

**`netlify/functions/_shared/roster.js`** (new) — `validGids` Set + `isValidGid(gid)`, read from `data/roster.json` (`readFileSync` relative to module). Used by create-task to validate follower/assignee.

**`src/lib/auth.js`** (new, client) — `getAuthToken()`, `setAuth({token, expiresAt})`, `clearAuth()`, `isAuthValid()`. Single owner of the `ogc_auth` localStorage key/schema. Replaces the 3 scattered `JSON.parse(localStorage…)` reads (#24) in `App.jsx`, `asana.js`, `PassphraseGate.jsx`.

---

## P0 — Critical

| # | File | Fix |
|---|------|-----|
| 1 | `verify-passphrase.js`, `chat.js` | Apply `rate-limit.js`. verify-passphrase: strict (e.g. 5/min/IP). chat: looser (e.g. 20/min/IP) to cap Anthropic drain. |
| 2 | all 4 functions | `verify-passphrase`: 500 if `PASSPHRASE` unset; `crypto.timingSafeEqual` compare. The other 3: replace raw-compare with `requireAuth()` (signed-token verify) → forged/empty tokens rejected. |
| 3 | `PassphraseGate.jsx`, `asana.js`, `App.jsx` | verify-passphrase returns `{valid, token, expiresAt}`; client stores the **signed token** (not the passphrase) via `setAuth()`. All API calls send that token. Passphrase never leaves the gate. |

## P1 — High

| # | File | Fix |
|---|------|-----|
| 4 | `App.jsx:76` | Recursive `callPhilip('clear')` passes `currentFormData`. Folded into the `formDataRef` refactor (#20) so stale closure can't recur. |
| 5 | `App.jsx`, `PhilipChat.jsx` | Add `awaitingConfirm` state; `handleConfirm` early-returns if already in flight; pass `disabled` to the "Confirm & send" button. |
| 6 | `App.jsx:114` | Decouple `createTask`/`attachFile`. On `attachFile` failure after task created: still go to `STAGE.SUCCESS`, surface `taskUrl`, show a non-fatal "attachment failed" notice. No orphan/duplicate. |
| 7 | `App.jsx:74` | `callPhilip` takes a `depth` arg; the `'clear'` branch refuses to recurse past depth 1 (forces summary instead). |
| 8 | `create-task.js`, `attach-task.js`, `chat.js` | `signal: AbortSignal.timeout(8000)` on Asana calls, `9000` on Anthropic; catch `AbortError` → 504 with a clear message. |
| 9 | `attach-task.js:27` | Preflight `GET /tasks/{taskGid}?opt_fields=projects`; reject (403) unless `ASANA_PROJECT_GID` is in the task's projects. |

## P2 — Moderate

| # | File | Fix |
|---|------|-----|
| 10 | `chat.js:76` | Move `formData` fields out of the system prompt into a user-role message wrapped in `<form_submission>…</form_submission>` XML delimiters; add server-side length caps (title 200, details 4000, name 100). |
| 11 | `attach-task.js:36` | Before decode: reject if base64 length implies > ~1 MB; MIME allowlist matching `ACCEPTED_TYPES`. |
| 12 | `create-task.js:30` | If `summary` present, require all 5 fields non-empty; else fall back to `details`. Reject empty `{}` (no more literal `"undefined"` in notes). |
| 13 | `PhilipChat.jsx:169` | `showSummary && !summary` → render a recovery panel (retry / edit) instead of a blank box. |
| 14 | `App.jsx:72` | Hard cap: when `askedCount >= maxQ`, a `needs_clarification` response is overridden to force the summary follow-up. |
| 15 | `App.jsx:105` | Re-entrancy guard via `inFlightRef` (synchronous), not the async `awaitingAI` state. |
| 16 | `create-task.js:48` | Validate `followerGid`/`assigneeGid` against `roster.js` `validGids`; reject (422) unknown GIDs. |
| 17 | `IntakeForm.jsx:5` | Lower `MAX_FILE_BYTES` to ~700 KB; update the helper text + server cap (#11) to match. |
| 18 | `fetch-roster.mjs:56` | If pre-filter `results` non-empty but post-filter roster empty → `console.error` + `exit(1)` (fail build) instead of writing `[]`. |
| 19 | `chat.js:120` | When `status==='summarized'`, validate the `summary` object shape (5 non-empty fields) before 200; else 502. |
| 20 | `App.jsx:37` | Replace `currentStage`/`currentFormData` params with `formDataRef`/`stageRef` so `callPhilip` reads fresh state — removes the stale-closure workaround entirely (subsumes #4, #15). |
| 21 | `App.jsx:137` | `useReducer` with `RESET`/`EDIT` actions over one session-state object; `EDIT` now also clears `attachedFile`. Single initial-state constant. |

## P3 — Low

| # | File | Fix |
|---|------|-----|
| 22 | `fetch-roster.mjs:44` | Paginate Notion query: loop on `has_more`/`next_cursor`, accumulate `results`. |
| 23 | `App.jsx:158` | `const editable = stage === STAGE.FORM \|\| stage === STAGE.ERROR; const frozen = !editable` — positive allowlist. |
| 24 | `asana.js`, `App.jsx`, `PassphraseGate.jsx` | Use `src/lib/auth.js` `getAuthToken()` everywhere (see new modules). |
| 25 | `IntakeForm.test.jsx:107` | `.toBeFalsy()` → `.toBeNull()`. |

---

## Testing (gaps T1–T5 + new coverage)

- **T1** New `src/__tests__/App.test.jsx`: `callPhilip` network reject → ERROR; `!res.ok` → ERROR; `'clear'` recursion path; `handleConfirm` error path + double-click guard (#5); attach-failure-but-task-created success path (#6).
- **T2** `IntakeForm.test.jsx`: `handleFileChange` accept/reject, `clearFile`, size gate (now ~700 KB).
- **T3** `App.test.jsx`: auth-expiry `useState` initializer (expired token → unauth; valid → auth).
- **T4** `IntakeForm.test.jsx`: `handleNameChange` resets `assigneeGid` when it equals the newly selected staff's GID.
- **T5** `PassphraseGate.test.jsx`: `fetch` **rejects** (true network error) → catch path, distinct from `{ok:false}`.
- **New** unit tests for `_shared/auth.js` (issue→verify roundtrip, tamper → false, expired → false) and server validation (unknown `followerGid` → 422, empty `summary` → notes fallback, bad `taskGid` project → 403). Functions tested by importing `handler` and passing mock `event` objects (mock `fetch`).

---

## Config / docs

- `package.json`: add `@upstash/ratelimit`, `@upstash/redis`.
- `.env.example` + `CLAUDE.md` env table: add `AUTH_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Note `PASSPHRASE` is now only read by verify-passphrase.
- Netlify Site Settings: same 3 new vars must be added before deploy.

---

## Verification

1. `npm test` — all suites green, including new auth/validation/App tests.
2. `netlify dev`:
   - Wrong passphrase → 6th rapid attempt returns 429 (rate limit).
   - Correct passphrase → localStorage `ogc_auth.token` is a `exp.nonce.sig` string, **not** the passphrase.
   - `curl -X POST …/create-task -d '{}'` → 403 (no valid token), confirming bypass closed.
   - Full happy path: form → Philip Q&A → summary → confirm → Asana task in Inbox with clean notes (no `"undefined"`), follower/assignee valid, optional attachment.
   - Double-click "Confirm & send" → exactly one Asana task.
   - Submit with attach forced to fail → success screen with task URL + attachment-failed notice; no duplicate task.
3. `node --env-file=.env scripts/fetch-roster.mjs` with a renamed Notion property → exits non-zero, does not overwrite roster with `[]`.

## Suggested execution order

P0 (auth modules + 4 functions) → P1 (App flow + timeouts + taskGid) → P2 → P3 → tests last (lock in behavior). Commit per priority band.
