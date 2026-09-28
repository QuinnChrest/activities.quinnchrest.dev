import type { Activity } from '../data/types'
import { fmtDate, fmtDuration, fmtTime } from '../lib/format'
import { useUnits } from '../lib/units'

const SPORT_LABELS: Record<string, string> = {
  Ride: 'Ride',
  GravelRide: 'Gravel ride',
  MountainBikeRide: 'Mountain bike ride',
  EBikeRide: 'E-bike ride',
  Walk: 'Walk',
  Hike: 'Hike',
}

export const sportLabel = (a: Activity) =>
  SPORT_LABELS[a.sportType] ?? a.sportType.replace(/([a-z])([A-Z])/g, '$1 $2')

export function ActivityCard({ activity: a, action }: { activity: Activity; action: string }) {
  const { fmtDist, fmtElev } = useUnits()
  return (
    <div className={`card card--${a.kind}`}>
      <div className="card__kind">
        <span className={`dot dot--${a.kind}`} />
        {sportLabel(a)}
        <span className="card__date">
          {fmtDate(a.startLocal)} · {fmtTime(a.startLocal)}
        </span>
      </div>
      <h3 className="card__name">{a.name}</h3>
      <dl className="card__stats">
        <div>
          <dt>Distance</dt>
          <dd>{fmtDist(a.distance)}</dd>
        </div>
        <div>
          <dt>Moving time</dt>
          <dd>{fmtDuration(a.movingTime)}</dd>
        </div>
        <div>
          <dt>Elevation</dt>
          <dd>{fmtElev(a.elevationGain)}</dd>
        </div>
      </dl>
      <div className="card__foot">
        <span className="strava-link">{action}</span>
        {a.device === 'garmin' && <span className="card__device">Garmin</span>}
      </div>
    </div>
  )
}
