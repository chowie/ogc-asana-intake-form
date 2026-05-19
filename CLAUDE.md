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
```

## Architecture

**App flow** — `App.jsx` drives three mutually exclusive states via two boolean flags:
1. `!authenticated` → `PassphraseGate` (calls `/.netlify/functions/verify-passphrase`)
2. `authenticated && !submitted` → `IntakeForm`
3. `submitted` → `SuccessMessage`

**Netlify Functions proxy** — All secrets are server-side. The browser holds zero credentials.
- `netlify/functions/verify-passphrase.js` — validates the passphrase and returns `{ valid: boolean }`
- `netlify/functions/create-task.js` — proxies task creation to the Asana REST API; also validates `passphraseToken` as a secondary check to prevent direct POST abuse
- `netlify/functions/chat.js` — proxies conversation to the Anthropic API (Philip persona)
- `netlify/functions/attach-task.js` — uploads optional file attachments to the Asana task

**Roster** — `data/roster.json` is the staff list (name, email, asanaGid). The committed file contains placeholder data. At build time, `scripts/fetch-roster.mjs` fetches the live roster from a Notion database and overwrites it. `src/config/staff.js` imports from this file and exports `STAFF` and `findStaff()`.

**`src/lib/asana.js`** — `createTask()` POSTs to `/.netlify/functions/create-task`, including `passphraseToken` from `localStorage`. `attachFile()` POSTs to `/.netlify/functions/attach-task`.

**`src/components/PassphraseGate.jsx`** — on successful passphrase verification, stores auth in `localStorage` under key `ogc_auth` (expires after 1 hour).

**Tests** use Vitest + `@testing-library/react` with jsdom. `src/config/staff.js` is mocked with `vi.mock` + `vi.hoisted` in `IntakeForm.test.jsx`. `PassphraseGate.test.jsx` mocks `globalThis.fetch` with `vi.stubGlobal`. Test setup file is `src/test/setup.js`.

## Environment Variables

Copy `.env.example` to `.env`. All vars are server-side only (no `VITE_` prefix — never bundled into client JS). `netlify dev` reads `.env` automatically.

| Variable | Description |
|---|---|
| `PASSPHRASE` | Shared passphrase shown before the form |
| `ASANA_PAT` | Asana Personal Access Token |
| `ASANA_PROJECT_GID` | GID of the "OGC Deacons" Asana project |
| `ASANA_INBOX_SECTION_GID` | GID of the "Inbox" section in that project |
| `ANTHROPIC_API_KEY` | Anthropic API key for Philip (the AI clarification assistant) |
| `NOTION_TOKEN` | Notion internal integration token (read-only, scoped to roster DB) |
| `NOTION_ROSTER_DB_ID` | ID of the Notion database containing the deacon roster |

## Deployment

Deployed to Netlify. The `netlify.toml` handles build config, functions directory, and SPA redirect. All seven env vars must be set in Netlify's **Site Settings → Environment variables**. The build command runs `scripts/fetch-roster.mjs` before Vite to bake the live roster into the bundle.
