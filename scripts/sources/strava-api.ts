// Phase 2 (not implemented yet): incremental sync from the Strava API.
//
// Intended flow, run nightly by a GitHub Action:
//   1. POST https://www.strava.com/oauth/token with STRAVA_CLIENT_ID,
//      STRAVA_CLIENT_SECRET and STRAVA_REFRESH_TOKEN (GitHub secrets),
//      grant_type=refresh_token → short-lived access token.
//   2. GET /api/v3/athlete/activities?after=<newest start in activities.json>
//      (paginate with per_page=100).
//   3. For each new activity, GET /api/v3/activities/{id}/streams?keys=latlng
//      &key_by_type=true for full-resolution points, and use `device_name`
//      from GET /api/v3/activities/{id} to set `device: 'garmin'`.
//   4. Map each to RawActivity and hand the list to the same pipeline:
//        writeActivities(raws.flatMap(r => processActivity(r, privacy) ?? []), 'api', { merge: true })
//      Privacy zones come from the PRIVACY_CONFIG secret (see lib/privacy.ts).
//   5. Commit public/data/activities.json if it changed; the deploy workflow
//      rebuilds the site on push.
//
// Because the existing JSON is already privacy-processed, merging new
// activities into it never requires the raw history.

import type { RawActivity } from '../lib/pipeline.ts'

export async function fetchNewActivities(_since: Date): Promise<RawActivity[]> {
  throw new Error('Strava API sync is not implemented yet (Phase 2).')
}
