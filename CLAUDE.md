# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
netlify dev        # full-stack dev server (Vite + Netlify Functions) at http://localhost:8888
npm run dev        # frontend only (no functions) at http://localhost:5173
npm run build      # production build → dist/
npm test           # run all tests once (vitest)
npm run test:watch # vitest in watch mode

# Run a single test file
npx vitest run src/__tests__/IntakeForm.test.jsx
```

## Architecture

**App flow** — `App.jsx` drives three mutually exclusive states via two boolean flags:
1. `!authenticated` → `PassphraseGate` (calls `/.netlify/functions/verify-passphrase`)
2. `authenticated && !submitted` → `IntakeForm`
3. `submitted` → `SuccessMessage`

**Netlify Functions proxy** — All secrets are server-side. The browser holds zero credentials.
- `netlify/functions/verify-passphrase.js` — validates the passphrase and returns `{ valid: boolean }`
- `netlify/functions/create-task.js` — proxies task creation to the Asana REST API; also validates `passphraseToken` as a secondary check to prevent direct POST abuse

**`src/config/staff.js`** is the single source of truth for staff. Each entry has `name`, `email`, and `asanaGid`. Selecting a name in `IntakeForm` auto-fills the email and determines which Asana user becomes a task follower (`followerGid`).

**`src/lib/asana.js`** — `createTask()` POSTs to `/.netlify/functions/create-task`, including `passphraseToken` from `sessionStorage`. The exported signature is unchanged from V1.

**`src/components/PassphraseGate.jsx`** — on successful passphrase verification, stores the passphrase in `sessionStorage` under key `ogc_passphrase_token` for use by `createTask()`.

**Tests** use Vitest + `@testing-library/react` with jsdom. `asana.js` is mocked with `vi.mock` in `IntakeForm.test.jsx`. `PassphraseGate.test.jsx` mocks `globalThis.fetch` with `vi.stubGlobal`. Test setup file is `src/test/setup.js`.

## Environment Variables

Copy `.env.example` to `.env`. All vars are server-side only (no `VITE_` prefix — never bundled into client JS). `netlify dev` reads `.env` automatically.

| Variable | Description |
|---|---|
| `PASSPHRASE` | Shared passphrase shown before the form |
| `ASANA_PAT` | Asana Personal Access Token |
| `ASANA_PROJECT_GID` | GID of the "OGC Deacons" Asana project |
| `ASANA_INBOX_SECTION_GID` | GID of the "Inbox" section in that project |

## Deployment

Deployed to Netlify. The `netlify.toml` handles build config, functions directory, and SPA redirect. All four env vars must be set in Netlify's **Site Settings → Environment variables** (without the `VITE_` prefix).
