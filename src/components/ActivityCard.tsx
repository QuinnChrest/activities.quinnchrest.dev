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

/**
 * `href` makes the action a real link ("View on Strava"). Without it the action
 * is just text: a hint like "Click to select", or link-styled when a parent
 * element is the link (the mobile sheet wraps the whole card).
 */
export function ActivityCard(props: { activity: Activity; action: string; href?: string }) {
  const { activity: a, action, href } = props
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
        {href ? (
          <a className="strava-link" href={href} target="_blank" rel="noopener">
            {action}
          </a>
        ) : (
          <span className={action.startsWith('Click') ? 'card__hint' : 'strava-link'}>{action}</span>
        )}
        {a.device === 'garmin' && <span className="card__device">Garmin</span>}
      </div>
    </div>
  )
}
