// Incremental sync from the Strava API (used by scripts/sync-strava.ts).
//
//   1. POST /oauth/token with STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET and
//      STRAVA_REFRESH_TOKEN, grant_type=refresh_token → short-lived access token.
//   2. GET /athlete/activities?after=<since> (paginated, per_page=100).
//   3. For each bike/walk activity with GPS, GET /activities/{id} for
//      `device_name` (Garmin attribution) and /activities/{id}/streams?keys=latlng
//      for full-resolution points.
//   4. Map each to RawActivity; the caller runs the usual privacy pipeline and
//      merges into activities.json by id.
//
// The refresh token needs the activity:read_all scope; get one with
// `npm run strava:auth`.

import type { LatLng } from '../../src/lib/polyline.ts'
import { kindForSportType, type RawActivity } from '../lib/pipeline.ts'

const API = 'https://www.strava.com/api/v3'
export const TOKEN_URL = 'https://www.strava.com/oauth/token'

export interface StravaCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
}

interface SummaryActivity {
  id: number
  name: string
  sport_type: string
  start_date: string
  distance: number
  moving_time: number
  total_elevation_gain: number
  average_speed: number
  manual: boolean
  trainer: boolean
  start_latlng: LatLng | [] | null
}

interface DetailedActivity extends SummaryActivity {
  device_name?: string
}

interface StreamSet {
  latlng?: { data: LatLng[] }
}

export interface FetchResult {
  activities: RawActivity[]
  skipped: { id: string; reason: string }[]
  /** Set when Strava issued a new refresh token; the stored one should be replaced. */
  rotatedRefreshToken?: string
}

export function credentialsFromEnv(): StravaCredentials {
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env
  const missing = Object.entries({ STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN })
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) throw new Error(`Missing ${missing.join(', ')} (set them in .env or as CI secrets).`)
  return { clientId: STRAVA_CLIENT_ID!, clientSecret: STRAVA_CLIENT_SECRET!, refreshToken: STRAVA_REFRESH_TOKEN! }
}

export async function fetchNewActivities(since: Date, creds: StravaCredentials): Promise<FetchResult> {
  const token = await refreshAccessToken(creds)
  const get = <T>(path: string) => request<T>(`${API}${path}`, token.access_token)

  const summaries: SummaryActivity[] = []
  const after = Math.floor(since.getTime() / 1000)
  for (let page = 1; ; page++) {
    const batch = await get<SummaryActivity[]>(`/athlete/activities?after=${after}&per_page=100&page=${page}`)
    summaries.push(...batch)
    if (batch.length < 100) break
  }

  const activities: RawActivity[] = []
  const skipped: FetchResult['skipped'] = []
  for (const s of summaries) {
    const id = String(s.id)
    if (!kindForSportType(s.sport_type)) {
      skipped.push({ id, reason: `type "${s.sport_type}"` })
      continue
    }
    if (s.manual || s.trainer || !s.start_latlng?.length) {
      skipped.push({ id, reason: 'no GPS (manual/indoor)' })
      continue
    }
    const [detail, streams] = await Promise.all([
      get<DetailedActivity>(`/activities/${id}`),
      get<StreamSet>(`/activities/${id}/streams?keys=latlng&key_by_type=true`),
    ])
    const points = streams.latlng?.data ?? []
    if (points.length < 2) {
      skipped.push({ id, reason: 'no GPS points' })
      continue
    }
    activities.push({
      id,
      name: s.name || s.sport_type,
      sportType: s.sport_type,
      start: new Date(s.start_date),
      distance: s.distance,
      movingTime: s.moving_time,
      elevationGain: s.total_elevation_gain,
      avgSpeed: s.average_speed || (s.moving_time ? s.distance / s.moving_time : 0),
      device: /garmin/i.test(detail.device_name ?? '') ? 'garmin' : undefined,
      points,
    })
  }

  return {
    activities,
    skipped,
    rotatedRefreshToken: token.refresh_token !== creds.refreshToken ? token.refresh_token : undefined,
  }
}

async function refreshAccessToken(creds: StravaCredentials): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    throw new Error(
      `Strava token refresh failed (${res.status}): ${await res.text()}\n` +
        'The refresh token may be revoked or missing activity:read_all. Run `npm run strava:auth` to get a new one.',
    )
  }
  return (await res.json()) as TokenResponse
}

async function request<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (res.status === 429) throw new Error('Strava rate limit hit; try again in 15 minutes.')
  if (!res.ok) throw new Error(`GET ${url.replace(API, '')} failed (${res.status}): ${await res.text()}`)
  return (await res.json()) as T
}
