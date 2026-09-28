import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ActivitiesFile, Activity, ActivityKind } from '../../src/data/types.ts'
import { encodePolyline, type LatLng } from '../../src/lib/polyline.ts'
import { site } from '../../src/site.config.ts'
import { simplify } from './geo.ts'
import { applyPrivacy, type PrivacyConfig } from './privacy.ts'

/**
 * What every data source (bulk export, sample generator, Strava API) produces.
 * `points` are raw, unprocessed coordinates and must never be written anywhere
 * except through `processActivity`.
 */
export interface RawActivity {
  id: string
  name: string
  sportType: string
  start: Date
  distance: number
  movingTime: number
  elevationGain: number
  avgSpeed: number
  device?: 'garmin'
  points: LatLng[]
}

export const OUTPUT_PATH = 'public/data/activities.json'

const BIKE_TYPES = new Set([
  'Ride', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'EMountainBikeRide', 'Handcycle', 'Velomobile',
])
const WALK_TYPES = new Set(['Walk', 'Hike'])

export function kindForSportType(sportType: string): ActivityKind | undefined {
  const t = sportType.replace(/\s+/g, '')
  if (BIKE_TYPES.has(t) || /^(Road|Gravel|Mountain|E-?Bike)?Ride$/i.test(t)) return 'bike'
  if (WALK_TYPES.has(t)) return 'walk'
  return undefined
}

/** Simplification tolerance in meters. ~6 m keeps roads recognizable at street zoom. */
const SIMPLIFY_TOLERANCE = 6

export function processActivity(raw: RawActivity, privacy: PrivacyConfig): Activity | undefined {
  const kind = kindForSportType(raw.sportType)
  if (!kind) return undefined
  const segments = applyPrivacy(raw.points, privacy)
    .map((seg) => simplify(seg, SIMPLIFY_TOLERANCE))
    .filter((seg) => seg.length >= 2)
  return {
    id: raw.id,
    name: raw.name,
    kind,
    sportType: raw.sportType,
    start: raw.start.toISOString(),
    startLocal: toLocalIso(raw.start, site.timeZone),
    distance: round(raw.distance, 1),
    movingTime: Math.round(raw.movingTime),
    elevationGain: round(raw.elevationGain, 1),
    avgSpeed: round(raw.avgSpeed, 3),
    ...(raw.device ? { device: raw.device } : {}),
    route: segments.map(encodePolyline),
  }
}

export function toLocalIso(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

function round(n: number, digits: number) {
  const f = 10 ** digits
  return Math.round((n || 0) * f) / f
}

export function readExisting(path = OUTPUT_PATH): ActivitiesFile | undefined {
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, 'utf8')) as ActivitiesFile
}

/**
 * Writes the output file. With `merge`, activities already in the existing file
 * are kept and new ones (by id) replace/extend them. That's what an incremental
 * source like the Strava API uses, since the existing file is already privacy-processed.
 */
export function writeActivities(
  activities: Activity[],
  source: ActivitiesFile['source'],
  { merge = false, path = OUTPUT_PATH } = {},
) {
  const byId = new Map<string, Activity>()
  let outSource = source
  if (merge) {
    const existing = readExisting(path)
    if (existing) {
      for (const a of existing.activities) byId.set(a.id, a)
      if (existing.source !== source) outSource = 'mixed'
    }
  }
  for (const a of activities) byId.set(a.id, a)
  const sorted = [...byId.values()].sort((a, b) => a.start.localeCompare(b.start))
  const file: ActivitiesFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: outSource,
    activities: sorted,
  }
  mkdirSync(dirname(path), { recursive: true })
  const json = JSON.stringify(file)
  writeFileSync(path, json)
  const kinds = sorted.reduce<Record<string, number>>((acc, a) => ((acc[a.kind] = (acc[a.kind] ?? 0) + 1), acc), {})
  console.log(
    `Wrote ${sorted.length} activities (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}) ` +
      `to ${path} — ${(json.length / 1024).toFixed(0)} KB`,
  )
}
