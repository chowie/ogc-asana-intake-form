# Todo — ogc-asana-intake-form

## Status: Phase 3 complete and live. UX polish shipped 2026-05-13. ✓

---

## Backlog

### Phase 1 ✓

- [x] Scope both API tokens to minimum necessary permissions — Asana PAT rotated to `ogc.deacons@gmail.com` service account (scoped to OGC Deacons project only); Anthropic Console spend cap set.

---

### Phase 2 ✓

- [x] Add Netlify Functions proxy — `verify-passphrase` and `create-task` functions route all external calls server-side. All four env vars renamed (dropped `VITE_` prefix). Secrets confirmed absent from production bundle. 19 tests passing. Smoke tested live. ✓

---

### Phase 3 ✓

- [x] Philip AI clarifier — chat panel between form submission and Asana task creation. Asks up to 3 clarifying questions, produces a structured 5-field summary, user confirms before task is created. Anthropic API key server-side via `netlify/functions/chat.js`. Merged and tested locally. ✓

---

### Phase 4 (Backlog)

- [ ] Add Netlify Identity for real user authentication, replacing the shared passphrase entirely.

---

## In Progress

---

## Done

- [x] 1-hour session persistence — switched from `sessionStorage` to `localStorage` with expiry timestamp; authenticated users stay logged in across page reloads and new tabs for 1 hour. (2026-05-13)
- [x] Submitter name/email persistence — last-selected name and email saved to `localStorage`; form pre-populates on every load so returning users skip re-selecting themselves. (2026-05-13)
- [x] App scaffold (Vite + React + Tailwind)
- [x] PassphraseGate component + tests
- [x] IntakeForm component with validation + tests
- [x] SuccessMessage component
- [x] `asana.js` — createTask() with follower, project, section, due date
- [x] Staff config — all 5 staff with real Asana GIDs and emails (Bonnie Schulert, Andrew Fulton, Rachel Fulton, Derek Smith, Jordan Shaulis)
- [x] Netlify deployment config (`netlify.toml`)
- [x] Docker support (Dockerfile, docker-compose.yml)
- [x] `.env.example` documented
- [x] All 16 tests passing
- [x] End-to-end smoke test on live Netlify site — all 3 checks passed
- [x] Removed irrelevant PHP pre-commit hook
