// Shape of public/data/activities.json. Shared by the site and the build scripts.

export type ActivityKind = 'bike' | 'walk'

export interface Activity {
  /** Strava activity id (string: ids can outgrow safe JS integers). */
  id: string
  name: string
  kind: ActivityKind
  /** Original Strava sport type, e.g. "Ride", "GravelRide", "Hike". */
  sportType: string
  /** Start time, UTC ISO-8601. */
  start: string
  /** Start time in the site's configured time zone, "YYYY-MM-DDTHH:mm:ss" (no offset). */
  startLocal: string
  /** Meters. */
  distance: number
  /** Seconds. */
  movingTime: number
  /** Meters. */
  elevationGain: number
  /** Meters per second. */
  avgSpeed: number
  /** Set when the activity was recorded on a Garmin device (requires attribution). */
  device?: 'garmin'
  /** Privacy-processed, simplified route as Google encoded polylines (precision 5). May be split into several segments. */
  route: string[]
}

export interface ActivitiesFile {
  version: 1
  generatedAt: string
  source: 'sample' | 'export' | 'api' | 'mixed'
  activities: Activity[]
}
