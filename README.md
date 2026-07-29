# OGC Deacon Board — Request Form

A React app that lets Oneida Gospel Church staff submit requests to the Deacon board. Staff fill out a form, chat briefly with Philip (an AI assistant) who asks a couple of clarifying questions and produces a structured summary, then confirm before the request is created as an Asana task. An optional document attachment can be included and will be attached directly to the Asana task.

All secrets live server-side in Netlify Functions — no credentials are bundled into the client JS.

## Documentation

Full docs live in [`docs/`](docs/) and are published with [Mintlify](https://mintlify.com).

| I want to… | Start at |
|---|---|
| Submit a request (staff) | [`docs/staff/submitting-a-request.mdx`](docs/staff/submitting-a-request.mdx) |
| Run the app locally | [`docs/development/quickstart.mdx`](docs/development/quickstart.mdx) |
| Understand the architecture | [`docs/architecture/overview.mdx`](docs/architecture/overview.mdx) |
| Deploy, rotate secrets, fix the roster | [`docs/operations/deployment.mdx`](docs/operations/deployment.mdx) |
| Debug a failure | [`docs/operations/troubleshooting.mdx`](docs/operations/troubleshooting.mdx) |

Preview the docs site locally:

```bash
npm run docs      # or: cd docs && mint dev
```

## Quickstart

```bash
git clone <repo-url>
cd ogc-asana-intake-form
npm install
cp .env.example .env
# fill in .env — see docs/development/environment-variables.mdx
netlify dev   # Vite + Netlify Functions at http://localhost:8888
```

`npm run dev` starts the frontend only (port 5173). Philip, the passphrase gate, and task creation all need `netlify dev`.

## Commands

| Command | What it does |
|---|---|
| `netlify dev` | Full stack — Vite + Functions on :8888 |
| `npm run dev` | Frontend only on :5173 |
| `npm run build` | Production build to `dist/` |
| `npm test` | Run the test suite once (78 tests) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run docs` | Preview the docs site |
| `npm run gen-secret` | Print a random value for `AUTH_SECRET` |
| `npm run refresh-roster` | Regenerate `data/roster.json` from Notion |

## Layout

```
src/                   React app (App.jsx drives a 6-stage reducer)
netlify/functions/     verify-passphrase · chat · create-task · attach-task
scripts/               fetch-roster.mjs — Notion → data/roster.json at build time
data/roster.json       generated staff list (placeholder data in git)
docs/                  Mintlify documentation site
```

> **Note:** `data/roster.json` in git contains placeholder data only. Running the fetch script locally overwrites it with real staff data — `git checkout data/roster.json` before committing. A test guards against committing real PII.

## Deployment

Netlify, auto-deploying from `master`. Build config, functions directory, and the SPA redirect are all in `netlify.toml`; the ten environment variables are set in the Netlify dashboard. See [`docs/operations/deployment.mdx`](docs/operations/deployment.mdx).
