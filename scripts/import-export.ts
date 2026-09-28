// npm run data:import -- <path-to-unzipped-export> [--merge]
// Reads a Strava bulk export, applies privacy rules, simplifies tracks and
// writes public/data/activities.json. Raw files are never copied anywhere.

import { loadPrivacyConfig } from './lib/privacy.ts'
import { processActivity, writeActivities } from './lib/pipeline.ts'
import { readStravaExport } from './sources/strava-export.ts'

const args = process.argv.slice(2)
const dir = args.find((a) => !a.startsWith('--')) ?? 'export'
const merge = args.includes('--merge')

const privacy = loadPrivacyConfig()
console.log(`Reading export from ${dir} …`)
const { activities: raw, skipped } = readStravaExport(dir)

const activities = raw.flatMap((r) => processActivity(r, privacy) ?? [])
const emptied = activities.filter((a) => a.route.length === 0).length

if (skipped.length) {
  const reasons = new Map<string, number>()
  for (const s of skipped) {
    const key = s.reason.replace(/ .*\.(fit|gpx|tcx)(\.gz)?.*/i, ' <file>')
    reasons.set(key, (reasons.get(key) ?? 0) + 1)
  }
  console.log(`Skipped ${skipped.length} activities:`)
  for (const [reason, n] of reasons) console.log(`  ${n.toString().padStart(5)} × ${reason}`)
}
if (emptied) console.log(`${emptied} activities had no points left after privacy rules (kept in stats, not drawn).`)

writeActivities(activities, 'export', { merge })
