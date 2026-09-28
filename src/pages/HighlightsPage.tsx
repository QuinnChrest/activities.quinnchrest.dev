import { useMemo, useState, type ReactNode } from 'react'
import { Attribution } from '../components/Attribution'
import { CalendarGrid } from '../components/CalendarGrid'
import { StackedBars } from '../components/StackedBars'
import type { Activity } from '../data/types'
import { useActivities } from '../data/useActivities'
import { fmtDate, intFmt, localDate, stravaUrl } from '../lib/format'
import {
  distanceByMonth,
  distanceByYear,
  EARTH_CIRCUMFERENCE_M,
  EVEREST_M,
  MARATHON_M,
  MISSISSIPPI_M,
  MOON_DISTANCE_M,
  records,
  totals,
  yearOf,
} from '../lib/stats'
import { UnitsToggle, useUnits } from '../lib/units'
import { site } from '../site.config'
import './highlights.css'

export default function HighlightsPage() {
  const state = useActivities()
  return (
    <div className="hl">
      <header className="hl__nav">
        <a href="#/" className="hl__back">
          <span aria-hidden>←</span> Map
        </a>
        <span className="hl__brand">{site.name}</span>
        <UnitsToggle />
      </header>
      {state.status === 'loading' && <p className="hl__status">Loading activities…</p>}
      {state.status === 'error' && <p className="hl__status">{state.error}</p>}
      {state.status === 'ready' && <Highlights activities={state.data.activities} />}
    </div>
  )
}

const THIS_YEAR = new Date().getFullYear()
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const pctFmt = (v: number) => (v < 10 ? nf1.format(v) : intFmt.format(v))

function Highlights({ activities }: { activities: Activity[] }) {
  const u = useUnits()
  const t = useMemo(() => totals(activities), [activities])
  const rec = useMemo(() => records(activities), [activities])
  const years = useMemo(() => [...new Set(activities.map(yearOf))].sort((a, b) => a - b), [activities])
  const [monthYear, setMonthYear] = useState<number | 'all'>('all')
  const [calYear, setCalYear] = useState(years.includes(THIS_YEAR) ? THIS_YEAR : years[years.length - 1])

  if (!activities.length) return <p className="hl__status">No activities yet.</p>

  const first = activities[0]
  const bikeShare = t.all.distance ? t.bike.distance / t.all.distance : 0

  return (
    <main>
      {/* ---------- Hero ---------- */}
      <section className="hero">
        <p className="eyebrow">Since {localDate(first.startLocal).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
        <h1 className="hero__number">
          {intFmt.format(u.dist(t.all.distance))}
          <span className="hero__unit">{u.distUnit === 'mi' ? 'miles' : 'kilometers'}</span>
        </h1>
        <p className="hero__sub">
          on foot and on two wheels, across {intFmt.format(t.all.count)} activities and{' '}
          {intFmt.format(t.all.movingTime / 3600)} hours in motion.
        </p>

        <div className="split" role="img" aria-label={`${Math.round(bikeShare * 100)}% of distance by bike`}>
          <div className="split__bar split__bar--bike" style={{ flexGrow: t.bike.distance }} />
          <div className="split__bar split__bar--walk" style={{ flexGrow: t.walk.distance }} />
        </div>

        <div className="kinds">
          {(['bike', 'walk'] as const).map((k) => (
            <div key={k} className={`kind kind--${k}`}>
              <div className="kind__head">
                <span className={`swatch swatch--${k}`} />
                {k === 'bike' ? 'Rides' : 'Walks'}
                <span className="kind__share">
                  {Math.round((k === 'bike' ? bikeShare : 1 - bikeShare) * 100)}% of distance
                </span>
              </div>
              <dl className="kind__stats">
                <Stat label="Distance" value={u.fmtDist(t[k].distance, 0)} />
                <Stat label="Moving time" value={`${intFmt.format(t[k].movingTime / 3600)} h`} />
                <Stat label="Elevation" value={u.fmtElev(t[k].elevation)} />
                <Stat label="Activities" value={intFmt.format(t[k].count)} />
              </dl>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Charts ---------- */}
      <Section
        kicker="Year by year"
        title={`${u.distUnit === 'mi' ? 'Miles' : 'Kilometers'} per year`}
        aside={<Legend />}
      >
        <StackedBars
          data={distanceByYear(activities)}
          toValue={u.dist}
          unit={u.distUnit}
          caption={`Distance per year (${u.distUnit})`}
        />
      </Section>

      <Section
        kicker="Seasons"
        title="When the miles happen"
        aside={
          <div className="chips">
            <button className="chip" aria-pressed={monthYear === 'all'} onClick={() => setMonthYear('all')}>
              All years
            </button>
            {years.map((y) => (
              <button key={y} className="chip" aria-pressed={monthYear === y} onClick={() => setMonthYear(y)}>
                {y}
              </button>
            ))}
          </div>
        }
      >
        <Legend />
        <StackedBars
          data={distanceByMonth(activities, monthYear)}
          toValue={u.dist}
          unit={u.distUnit}
          caption={`Distance per month, ${monthYear === 'all' ? 'all years' : monthYear} (${u.distUnit})`}
        />
      </Section>

      {/* ---------- Records ---------- */}
      <Section kicker="Personal bests" title="Records">
        <div className="records">
          {rec.longestRide && (
            <RecordCard label="Longest ride" value={u.fmtDist(rec.longestRide.distance)} activity={rec.longestRide} />
          )}
          {rec.longestWalk && (
            <RecordCard label="Longest walk" value={u.fmtDist(rec.longestWalk.distance)} activity={rec.longestWalk} />
          )}
          {rec.biggestClimb && (
            <RecordCard
              label="Biggest climb"
              value={u.fmtElev(rec.biggestClimb.elevationGain)}
              activity={rec.biggestClimb}
            />
          )}
          {rec.fastestRide && (
            <RecordCard
              label="Fastest ride"
              value={u.fmtSpeed(rec.fastestRide.avgSpeed)}
              note={`average, rides over ${u.fmtDist(site.fastestRideMinDistance, 0)}`}
              activity={rec.fastestRide}
            />
          )}
          {rec.bestWeek && (
            <RecordCard
              label="Most active week"
              value={u.fmtDist(rec.bestWeek.distance)}
              note={`${rec.bestWeek.count} activities, week of ${fmtDate(`${rec.bestWeek.start}T12:00:00`, { weekday: undefined })}`}
              activity={rec.bestWeek.top}
              linkLabel="Longest that week"
            />
          )}
          {rec.longestStreak && (
            <RecordCard
              label="Longest streak"
              value={`${rec.longestStreak.days} days`}
              note={`${fmtDate(`${rec.longestStreak.start}T12:00:00`, { weekday: undefined, year: undefined })} – ${fmtDate(`${rec.longestStreak.end}T12:00:00`, { weekday: undefined })}`}
              activity={rec.longestStreak.top}
              linkLabel="Longest of the streak"
            />
          )}
        </div>
      </Section>

      {/* ---------- Equivalents ---------- */}
      <Section kicker="Put another way" title="Fun equivalents">
        <div className="equiv">
          <Equivalent
            big={`${nf1.format(t.all.elevation / EVEREST_M)}×`}
            label="up Mount Everest"
            detail={`${u.fmtElev(t.all.elevation)} climbed, ${u.fmtElev(EVEREST_M)} per summit`}
            progress={Math.min(1, (t.all.elevation / EVEREST_M) % 1)}
            progressLabel="toward the next summit"
          />
          <Equivalent
            big={`${pctFmt((t.all.distance / EARTH_CIRCUMFERENCE_M) * 100)}%`}
            label="of the way around the Earth"
            detail={`${u.fmtDist(EARTH_CIRCUMFERENCE_M, 0)} at the equator`}
            progress={Math.min(1, t.all.distance / EARTH_CIRCUMFERENCE_M)}
          />
          <Equivalent
            big={`${pctFmt((t.all.distance / MOON_DISTANCE_M) * 100)}%`}
            label="of the way to the Moon"
            detail={`${u.fmtDist(MOON_DISTANCE_M, 0)} away, on average`}
            progress={Math.min(1, t.all.distance / MOON_DISTANCE_M)}
          />
          <Equivalent
            big={`${nf1.format(t.all.distance / MISSISSIPPI_M)}×`}
            label="the length of the Mississippi"
            detail={`Lake Itasca to the Gulf, ${u.fmtDist(MISSISSIPPI_M, 0)}`}
          />
          <Equivalent
            big={intFmt.format(t.walk.distance / MARATHON_M)}
            label="marathons walked"
            detail={`${u.fmtDist(t.walk.distance, 0)} on foot`}
          />
          <Equivalent
            big={nf1.format(t.all.movingTime / 86_400)}
            label="full days in motion"
            detail={`${intFmt.format(t.all.movingTime / 3600)} hours of moving time`}
          />
        </div>
      </Section>

      {/* ---------- Calendar ---------- */}
      <Section
        kicker="Every day"
        title={`${calYear} in activities`}
        aside={
          <div className="chips">
            {years.slice(-4).map((y) => (
              <button key={y} className="chip" aria-pressed={calYear === y} onClick={() => setCalYear(y)}>
                {y}
              </button>
            ))}
          </div>
        }
      >
        <CalendarGrid activities={activities} year={calYear} />
      </Section>

      <footer className="hl__footer">
        <Attribution activities={activities} />
        <p className="muted">
          Routes are trimmed near their start and end, and some areas are hidden for privacy.{' '}
          <a href={site.homeUrl}>{site.homeUrl.replace(/^https?:\/\//, '')}</a>
        </p>
      </footer>
    </main>
  )
}

function Section({ kicker, title, aside, children }: { kicker: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section__head">
        <div>
          <p className="eyebrow">{kicker}</p>
          <h2>{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Legend() {
  return (
    <div className="legend">
      <span>
        <i className="legend__key legend__key--bike" /> Rides
      </span>
      <span>
        <i className="legend__key legend__key--walk" /> Walks
      </span>
    </div>
  )
}

function RecordCard(props: { label: string; value: string; note?: string; activity: Activity; linkLabel?: string }) {
  const { label, value, note, activity: a, linkLabel } = props
  const { fmtDist } = useUnits()
  return (
    <article className={`record record--${a.kind}`}>
      <p className="record__label">{label}</p>
      <p className="record__value">{value}</p>
      {note && <p className="record__note">{note}</p>}
      <div className="record__activity">
        <span className={`dot dot--${a.kind}`} />
        <div>
          <p className="record__name">
            {linkLabel ? `${linkLabel}: ` : ''}
            {a.name}
          </p>
          <p className="record__meta">
            {fmtDate(a.startLocal, { weekday: undefined })} · {fmtDist(a.distance)}
          </p>
        </div>
      </div>
      <a className="strava-link record__link" href={stravaUrl(a.id)} target="_blank" rel="noopener">
        View on Strava
      </a>
    </article>
  )
}

function Equivalent(props: { big: string; label: string; detail: string; progress?: number; progressLabel?: string }) {
  const { big, label, detail, progress, progressLabel } = props
  return (
    <div className="eq">
      <p className="eq__big">{big}</p>
      <p className="eq__label">{label}</p>
      {progress !== undefined && (
        <div
          className="eq__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-label={progressLabel ?? label}
        >
          <div className="eq__fill" style={{ width: `${Math.max(progress * 100, 0.8)}%` }} />
        </div>
      )}
      <p className="eq__detail">{detail}</p>
    </div>
  )
}
