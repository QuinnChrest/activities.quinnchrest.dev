// npm run data:sample [-- --seed 42]
// Writes fake activities around Monticello, MN to public/data/activities.json.

import { loadPrivacyConfig } from './lib/privacy.ts'
import { processActivity, writeActivities } from './lib/pipeline.ts'
import { generateSampleActivities } from './sources/sample.ts'

const seedArg = process.argv.indexOf('--seed')
const seed = seedArg > -1 ? Number(process.argv[seedArg + 1]) : 42

const privacy = loadPrivacyConfig()
const raw = generateSampleActivities(seed)
const activities = raw.flatMap((r) => processActivity(r, privacy) ?? [])
writeActivities(activities, 'sample')
