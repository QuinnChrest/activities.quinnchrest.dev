// npm run data:sync -- [--days 7]
// Fetches the last N days of activities from the Strava API, applies privacy
// rules and merges them into public/data/activities.json by id. Re-fetching a
// window that overlaps existing data is harmless and picks up renames/edits.
// Credentials come from env vars (CI secrets) or a gitignored .env file.

import { existsSync } from 'node:fs'
import { loadPrivacyConfig } from './lib/privacy.ts'
import { processActivity, readExisting, writeActivities } from './lib/pipeline.ts'
import { credentialsFromEnv, fetchNewActivities } from './sources/strava-api.ts'

if (existsSync('.env')) process.loadEnvFile('.env')

const args = process.argv.slice(2)
const daysArg = args[args.indexOf('--days') + 1]
const days = args.includes('--days') ? Number(daysArg) : 7
if (!Number.isFinite(days) || days <= 0) throw new Error(`Invalid --days value: ${daysArg}`)

const privacy = loadPrivacyConfig()
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
console.log(`Fetching Strava activities since ${since.toISOString()} …`)

const { activities: raw, skipped, rotatedRefreshToken } = await fetchNewActivities(since, credentialsFromEnv())

if (rotatedRefreshToken) {
  const msg = 'Strava issued a new refresh token. Run `npm run strava:auth` if the stored one stops working.'
  console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : msg)
}
if (skipped.length) {
  console.log(`Skipped ${skipped.length} activities:`)
  for (const s of skipped) console.log(`  ${s.id}: ${s.reason}`)
}

const activities = raw.flatMap((r) => processActivity(r, privacy) ?? [])
const existing = new Map((readExisting()?.activities ?? []).map((a) => [a.id, JSON.stringify(a)]))
const changed = activities.filter((a) => existing.get(a.id) !== JSON.stringify(a))

if (!changed.length) {
  console.log(`Fetched ${activities.length} activities; activities.json is already up to date.`)
} else {
  const added = changed.filter((a) => !existing.has(a.id)).length
  console.log(`${added} new, ${changed.length - added} updated.`)
  writeActivities(activities, 'api', { merge: true })
}
