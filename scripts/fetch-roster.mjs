#!/usr/bin/env node
/**
 * Fetches the deacon roster from a Notion database and writes it to data/roster.json.
 *
 * Expected Notion database properties:
 *   Name      — title property
 *   Email     — email property
 *   Asana GID — rich_text property
 *   Active    — checkbox property (optional; if present, only checked rows are included)
 *
 * On any failure (missing env vars, Notion API error, network error), logs a warning
 * and exits 0 so the build continues with the committed fallback data/roster.json.
 */
import { writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = join(__dirname, '../data/roster.json')

const { NOTION_TOKEN, NOTION_ROSTER_DB_ID } = process.env

if (!NOTION_TOKEN || !NOTION_ROSTER_DB_ID) {
  console.warn('[fetch-roster] NOTION_TOKEN or NOTION_ROSTER_DB_ID not set — using fallback data/roster.json')
  process.exit(0)
}

try {
  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_ROSTER_DB_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Notion API responded ${res.status}: ${text}`)
  }

  const { results } = await res.json()

  const roster = results
    .filter((page) => {
      const active = page.properties?.Active
      return !active || active.checkbox === true
    })
    .map((page) => ({
      name: page.properties.Name?.title?.[0]?.plain_text ?? '',
      email: page.properties.Email?.email ?? '',
      asanaGid: page.properties['Asana GID']?.rich_text?.[0]?.plain_text ?? '',
    }))
    .filter((entry) => entry.name && entry.email && entry.asanaGid)

  writeFileSync(OUTPUT_PATH, JSON.stringify(roster, null, 2) + '\n')
  console.log(`[fetch-roster] Wrote ${roster.length} entries to data/roster.json`)
} catch (err) {
  console.warn(`[fetch-roster] ${err.message} — build will use fallback data/roster.json`)
  process.exit(0)
}
