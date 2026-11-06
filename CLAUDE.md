# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
netlify dev        # full-stack dev server (Vite + Netlify Functions) at http://localhost:8888
npm run dev        # frontend only (no functions) at http://localhost:5173
npm run build      # production build → dist/
npm test           # run all tests once (vitest)
npm run test:watch # vitest in watch mode

# Fetch roster from Notion (overwrites data/roster.json locally)
node --env-file=.env scripts/fetch-roster.mjs

# Run a single test file
npx vitest run src/__tests__/IntakeForm.test.jsx

# Preview the docs site (Mintlify, config in docs/docs.json)
npm run docs
```

## Documentation

Long-form docs live in `docs/` as Mintlify MDX and are the canonical reference —
the README is a pointer, not a duplicate. When behavior changes, update the
matching page:

| Area | Page |
|---|---|
| Staff-facing behavior | `docs/staff/*.mdx` |
| Setup, env vars, structure, tests | `docs/development/*.mdx` |
| Stage machine, functions, auth, roster | `docs/architecture/*.mdx` |
| Deploy, roster, secrets, rate limits, debugging | `docs/operations/*.mdx` |

Adding a page means adding its path to `navigation` in `docs/docs.json`.
Validate with `cd docs && npx mint@latest broken-links`.

## Architecture

**App flow** — `App.jsx` runs a `useReducer` stage machine: `FORM` → `SUBMITTING`
→ `CLARIFYING` → `SUMMARY` → `SUCCESS`, plus `ERROR`. Authentication sits outside
the reducer as `session` state (`undefined` = checking, `null` → `SignIn`,
else `{ email, canInvite }`), loaded from the `session` function on mount.
Token-bearing routes (`/invite`, `/verify`, `/login`) are read once via
`parseAuthRoute()` and stripped from the URL. A 401 from any protected call
sets `session` to null without unmounting, so the in-progress request survives
re-sign-in. The form is editable only in `FORM` and `ERROR` — a positive
allowlist, so any new stage is frozen by default.

Two constants bound the AI loop: `MAX_Q = 3` (question budget) and
`MAX_CLEAR_DEPTH = 2` (recursion cap on `clear` → summarize). Re-entrancy is
guarded by refs (`philipInFlight`, `confirmInFlight`), not state — state updates
aren't visible in the same tick, so a state guard wouldn't stop a double-click
from creating duplicate tasks.

**Auth (invite-only accounts, passwordless)** — Accounts, invites, and sessions
live in Upstash Redis (required; auth fails closed). Only SHA-256 hashes of
tokens are stored. Keys: `user:<email>` (status `pending|active`),
`invite:<hash>` (48h), `verify:<hash>` (24h), `login:<hash>` (15m),
`sess:<hash>` (30m, slid by `GETEX` on every authenticated request). One-time
tokens are consumed with `GETDEL`. Emails in `INVITER_EMAILS` can send invites
and sign in without one (bootstrap). Session cookie `ogc_session` is HttpOnly,
SameSite=Strict, browser-session (no Max-Age — the Redis TTL is authoritative).
Emailed-link pages spend tokens only on a button click (email scanners prefetch
links).

**Netlify Functions** — All secrets are server-side. The browser holds zero credentials.
- `session.js` (GET) — `{ authenticated, email, canInvite }`; also slides the session
- `login.js` — `{ email }` sends a magic link (enumeration-safe), `{ loginToken }` redeems it, `{ googleCredential }` signs in with Google
- `register.js` — `{ inviteToken, email | googleCredential }`; email must match the invite (mismatch doesn't burn it); creates a `pending` user and sends the confirmation email
- `verify-email.js` — `{ token }` activates the account and starts a session; `{ resend: email }` re-sends
- `create-invite.js` — inviter-only; returns `{ link, expiresAt, emailSent }`
- `logout.js`
- `create-task.js` — proxies task creation to the Asana REST API
- `chat.js` — proxies conversation to the Anthropic API (Philip persona)
- `attach-task.js` — uploads optional file attachments to the Asana task
- Protected functions call `await requireSession(event)` from `_shared/session.js` (401 if no live session). Auth endpoints use `parseJsonPost()` from `_shared/http.js`, which requires `Content-Type: application/json` (CSRF defense alongside SameSite=Strict).

**Roster** — `data/roster.json` is the staff list (name, email, asanaGid). The committed file contains placeholder data. At build time, `scripts/fetch-roster.mjs` fetches the live roster from a Notion database and overwrites it. `src/config/staff.js` imports from this file and exports `STAFF` and `findStaff()`.

**`src/lib/asana.js`** — `createTask()` / `attachFile()` POST to their functions; the session cookie rides along automatically. Errors are `ApiError` with `.status` so the app can spot 401.

**`src/lib/auth.js`** — API wrappers for the auth functions, `ApiError`, and `parseAuthRoute()`. Nothing is stored in `localStorage`.

**Tests** use Vitest + `@testing-library/react` with jsdom. `src/config/staff.js` is mocked with `vi.mock` + `vi.hoisted` in `IntakeForm.test.jsx`. `App.test.jsx` mocks `../lib/auth.js` (partial, via `importOriginal`) and stubs `GoogleButton.jsx`. Function tests mock `_shared/redis.js` with the in-memory fake in `netlify/functions/__tests__/helpers/fake-redis.js` (TTL-aware, driven by fake timers) and `seedSession()` for a signed-in cookie. Test setup file is `src/test/setup.js`.

## Environment Variables

Copy `.env.example` to `.env`. All vars are server-side only (no `VITE_` prefix — never bundled into client JS), except `VITE_GOOGLE_CLIENT_ID`, which is public by design. `netlify dev` reads `.env` automatically.

| Variable | Description |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL — **required**: accounts, invites, sessions, rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `INVITER_EMAILS` | Comma-separated emails allowed to send invites (and sign in without one) |
| `RESEND_API_KEY` | Resend API key — invite, confirmation, and sign-in emails |
| `EMAIL_FROM` | Sender, e.g. `OGC Deacons <noreply@domain>` (domain verified in Resend) |
| `GOOGLE_CLIENT_ID` | Google OAuth Web client ID — server verifies ID tokens (optional) |
| `VITE_GOOGLE_CLIENT_ID` | Same value, bundled for the Google button (optional; hidden if unset) |
| `ASANA_PAT` | Asana Personal Access Token |
| `ASANA_PROJECT_GID` | GID of the "OGC Deacons" Asana project |
| `ASANA_INBOX_SECTION_GID` | GID of the "Inbox" section in that project |
| `ANTHROPIC_API_KEY` | Anthropic API key for Philip (the AI clarification assistant) |
| `NOTION_TOKEN` | Notion internal integration token (read-only, scoped to roster DB) |
| `NOTION_ROSTER_DB_ID` | ID of the Notion database containing the deacon roster |

## Deployment

Deployed to Netlify. The `netlify.toml` handles build config, functions directory, and SPA redirect. Set the env vars in Netlify's **Site Settings → Environment variables** (the two Google vars are optional). Links in emails use Netlify's built-in `URL`, never the Host header. The build command runs `scripts/fetch-roster.mjs` before Vite to bake the live roster into the bundle.
