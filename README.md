# OGC Deacon Board — Request Form

A React app that lets Oneida Gospel Church staff submit requests to the Deacon board. Staff fill out a form, chat briefly with Philip (an AI assistant) who asks a couple of clarifying questions and produces a structured summary, then confirm before the request is created as an Asana task. An optional document attachment can be included and will be attached directly to the Asana task.

All secrets live server-side in Netlify Functions — no credentials are bundled into the client JS.

---

## Local Setup

```bash
git clone <repo-url>
cd ogc-asana-intake-form
npm install
cp .env.example .env
# fill in .env values (see below)
netlify dev   # runs Vite + Netlify Functions together at http://localhost:8888
```

`npm run dev` starts the frontend only (no functions) at `http://localhost:5173` — useful for UI work, but Philip and task creation won't work without `netlify dev`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in each value. All variables are server-side only — no `VITE_` prefix, never bundled into client JS.

| Variable | Description |
|---|---|
| `PASSPHRASE` | Shared passphrase shown to staff before the form |
| `ASANA_PAT` | Asana Personal Access Token (scoped to the OGC Deacons project) |
| `ASANA_PROJECT_GID` | GID of the "OGC Deacons" Asana project |
| `ASANA_INBOX_SECTION_GID` | GID of the "Inbox" section inside that project |
| `ANTHROPIC_API_KEY` | Anthropic API key for Philip (the AI clarification assistant) |
| `NOTION_TOKEN` | Notion internal integration token (read-only, scoped to roster DB) |
| `NOTION_ROSTER_DB_ID` | GID of the Notion database containing the deacon roster |

### Finding Asana GIDs

**Project GID** — open the project in Asana; the URL is `app.asana.com/0/<PROJECT_GID>/...`

**Section GID:**
```bash
curl -H "Authorization: Bearer <PAT>" \
  "https://app.asana.com/api/1.0/projects/<PROJECT_GID>/sections"
```

**User GIDs** — add each person's Asana user GID to the Notion roster database (see [Roster management](#roster-management) below):
```bash
curl -H "Authorization: Bearer <PAT>" \
  "https://app.asana.com/api/1.0/workspaces/<WORKSPACE_GID>/users"
```

---

## Architecture

**App flow:**
1. `PassphraseGate` — staff enter a shared passphrase (verified server-side via `verify-passphrase.js`)
2. `IntakeForm` — staff fill in name, title, details, optional due date, and optional document attachment
3. `PhilipChat` — Philip (AI) asks up to 3 clarifying questions, then produces a 5-field structured summary
4. Staff confirm the summary → Asana task created (`create-task.js`), attachment uploaded if present (`attach-task.js`)
5. `SuccessMessage` — confirmation with the Asana task name

**Netlify Functions** (`netlify/functions/`):
- `verify-passphrase.js` — validates the passphrase; returns `{ valid: boolean }`
- `chat.js` — proxies conversation to the Anthropic API (Philip persona + form context injected as system prompt)
- `create-task.js` — creates the Asana task with the Philip-structured summary as task notes
- `attach-task.js` — uploads the optional file attachment to the Asana task

Every function validates `passphraseToken` from the request body as a secondary guard against direct POST abuse.

**`data/roster.json`** is the build-time staff list. It is generated from Notion at build time (see [Roster management](#roster-management)) — the committed file contains only placeholder data and is overwritten during each Netlify build.

---

## Running Tests

```bash
npm test            # single run
npm run test:watch  # watch mode
```

Tests use Vitest + Testing Library. 36 tests across three files:

- **`PassphraseGate.test.jsx`** — renders correctly, calls `onAuthenticated` on correct passphrase, shows error on wrong passphrase, clears error on re-type
- **`IntakeForm.test.jsx`** — email auto-fill from staff selection, validation errors on empty required fields, correct `onSubmit` payload, frozen/submitting/apiError prop states
- **`PhilipChat.test.jsx`** — renders header and messages, typing indicator, send on click and Enter, input cleared after send, no send on empty input, disabled during AI wait, summary block shown, confirm/edit callbacks

---

## Deploying to Netlify

### Connect GitHub (recommended)

In the Netlify dashboard: **Site configuration → Build & deploy → Continuous deployment → Link repository**. Authorize GitHub via OAuth, select this repo, and Netlify will auto-deploy on every push to `master`. Build settings are read from `netlify.toml` automatically.

### Manual deploy via CLI

```bash
npm install -g netlify-cli
netlify deploy --build         # preview
netlify deploy --build --prod  # production
```

### Environment variables

Set all seven variables in **Netlify dashboard → Site configuration → Environment variables**. Functions read secrets at runtime; roster data is fetched at build time.

---

## Roster management

The deacon roster (names, emails, Asana GIDs) lives in a Notion database. During each Netlify build, `scripts/fetch-roster.mjs` fetches the database and writes `data/roster.json` — the file the React app and Netlify Functions read from.

**Notion database schema** (property names must match exactly):

| Property | Type | Description |
|---|---|---|
| `Name` | Title | Staff member's full name |
| `Email` | Email | Email address auto-filled in the form |
| `Asana GID` | Text | Asana user GID (used as follower/assignee) |
| `Active` | Checkbox | *(optional)* Only checked rows are included in the build |

**Notion integration setup:**
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and create an internal integration with read-only access
2. Share the roster database with the integration
3. Copy the integration token → `NOTION_TOKEN` env var
4. Copy the database ID from the database URL → `NOTION_ROSTER_DB_ID` env var (open the database as a full page; the ID is the 32-character hex string before `?v=` in the URL)

**Triggering a rebuild when the roster changes:**

Create a Netlify build hook: **Site configuration → Build & deploy → Build hooks → Add build hook**. Then in Notion, add an automation on the roster database: trigger on "Active" checkbox toggled → webhook action POSTs to the build hook URL. This models an explicit publish action rather than rebuilding on every edit.

For a manual refresh without a code push:
```bash
node --env-file=.env scripts/fetch-roster.mjs   # regenerates data/roster.json locally
```

If `NOTION_TOKEN` or `NOTION_ROSTER_DB_ID` are not set, the script exits cleanly and the build continues with the committed placeholder `data/roster.json`.

---

## Design decisions

**Why Notion as the roster source of truth, not a config file or database?**

The deacon roster already lives in Notion operationally. Keeping it there means non-technical staff can update names and emails without touching code. The alternatives considered:

- **Hardcoded config file** — means a code deploy for every roster change; also exposes personal emails and Asana GIDs publicly if the repo is open
- **Environment variables** — wrong fit for reference data with a schema (6 people × 3 fields = 18 env vars)
- **Runtime Notion fetch** — adds API latency and an outage dependency to every form load
- **Netlify Blobs / Postgres** — adds a runtime dependency for data that changes ~2x/year

**Build-time fetch with committed fallback** wins: zero runtime latency, no API outage risk in the hot path, and the repo stays free of personal data. The rebuild lag on roster changes is a non-issue at this cadence.
