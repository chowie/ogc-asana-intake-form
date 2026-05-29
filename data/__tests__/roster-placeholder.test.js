import { describe, expect, it } from 'vitest'
import roster from '../roster.json'

// Guard against re-committing real PII. The committed data/roster.json must
// always hold placeholder data — the live roster is fetched from Notion at
// build time (scripts/fetch-roster.mjs) and overwrites this file in the build,
// never in git. See README "Roster management".
describe('committed data/roster.json', () => {
  it('contains only placeholder entries (no real PII)', () => {
    expect(Array.isArray(roster)).toBe(true)
    expect(roster.length).toBeGreaterThan(0)

    for (const entry of roster) {
      // Every email must be on the reserved example.com domain (RFC 2606).
      expect(
        entry.email,
        `roster entry "${entry.name}" has a non-placeholder email: ${entry.email}. ` +
          'Real roster data must never be committed — it is fetched from Notion at build time.',
      ).toMatch(/@example\.com$/)
    }
  })

  it('contains no known real contact domains', () => {
    const forbidden = /@(gmail\.com|proton\.me|oneidagospel\.org)$/i
    for (const entry of roster) {
      expect(forbidden.test(entry.email), `real email committed: ${entry.email}`).toBe(false)
    }
  })
})
