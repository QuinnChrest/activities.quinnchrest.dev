import type { Activity } from '../data/types'

/** Strava / Garmin attribution. Garmin is only credited when Garmin-recorded data is shown. */
export function Attribution({ activities, compact = false }: { activities: Activity[]; compact?: boolean }) {
  const hasGarmin = activities.some((a) => a.device === 'garmin')
  return (
    <p className={`attribution ${compact ? 'attribution--compact' : ''}`}>
      <span className="powered">
        Powered by <strong>Strava</strong>
      </span>
      <span className="sep" aria-hidden>
        ·
      </span>
      <span>Personal project, not affiliated with Strava</span>
      {hasGarmin && (
        <>
          <span className="sep" aria-hidden>
            ·
          </span>
          <span>Includes activities recorded on Garmin devices</span>
        </>
      )}
    </p>
  )
}
