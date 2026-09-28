import { existsSync, readFileSync } from 'node:fs'
import type { LatLng } from '../../src/lib/polyline.ts'
import { haversine } from './geo.ts'

export interface PrivacyZone {
  /** Free-form label, never published. */
  name?: string
  lat: number
  lng: number
  /** Meters. */
  radius: number
}

export interface PrivacyConfig {
  /** Meters removed from the start and end of every track. */
  trimMeters: number
  zones: PrivacyZone[]
}

const DEFAULTS: PrivacyConfig = { trimMeters: 300, zones: [] }

/**
 * Loads privacy settings from (in priority order) the PRIVACY_CONFIG env var
 * (JSON, for CI secrets) or privacy.config.json in the repo root (gitignored).
 */
export function loadPrivacyConfig(path = 'privacy.config.json'): PrivacyConfig {
  let raw: Partial<PrivacyConfig> | undefined
  if (process.env.PRIVACY_CONFIG) {
    raw = JSON.parse(process.env.PRIVACY_CONFIG)
    console.log('Privacy: using PRIVACY_CONFIG env var')
  } else if (existsSync(path)) {
    raw = JSON.parse(readFileSync(path, 'utf8'))
    console.log(`Privacy: using ${path}`)
  } else {
    console.warn(`Privacy: no ${path} found; only trimming track ends (${DEFAULTS.trimMeters} m)`)
  }
  return {
    trimMeters: raw?.trimMeters ?? DEFAULTS.trimMeters,
    zones: raw?.zones ?? DEFAULTS.zones,
  }
}

/**
 * Removes every point inside a privacy zone (splitting the track where it
 * passes through one), then trims `trimMeters` from the start and end of the
 * whole activity. Returns zero or more segments.
 */
export function applyPrivacy(points: LatLng[], config: PrivacyConfig): LatLng[][] {
  // 1. Zones: drop points inside any zone; a gap splits the track.
  const segments: LatLng[][] = []
  let current: LatLng[] = []
  for (const p of points) {
    const hidden = config.zones.some((z) => haversine(p, [z.lat, z.lng]) <= z.radius)
    if (hidden) {
      if (current.length) segments.push(current)
      current = []
    } else {
      current.push(p)
    }
  }
  if (current.length) segments.push(current)

  // 2. Trim the first/last N meters of the activity as a whole.
  let result = segments
  if (config.trimMeters > 0) {
    result = trimStart(result, config.trimMeters)
    result = trimStart(
      result.map((s) => s.slice().reverse()).reverse(),
      config.trimMeters,
    )
      .map((s) => s.reverse())
      .reverse()
  }
  return result.filter((s) => s.length >= 2)
}

/**
 * Drops points from the start until the track is at least `meters` from its
 * first point in a straight line. Straight-line distance never exceeds path
 * distance, so this trims at least as much as trimming by path length and
 * also handles tracks that wander around near the start before leaving.
 */
function trimStart(segments: LatLng[][], meters: number): LatLng[][] {
  const origin = segments[0]?.[0]
  if (!origin) return segments
  const out: LatLng[][] = []
  let done = false
  for (const seg of segments) {
    if (done) {
      out.push(seg)
      continue
    }
    const i = seg.findIndex((p) => haversine(p, origin) >= meters)
    if (i !== -1) {
      out.push(seg.slice(i))
      done = true
    }
  }
  return out
}
