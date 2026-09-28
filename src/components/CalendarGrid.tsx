import { useEffect, useMemo, useRef, useState } from 'react'
import type { Activity, ActivityKind } from '../data/types'
import { fmtDate, stravaUrl } from '../lib/format'
import { groupByDay } from '../lib/stats'
import { useUnits } from '../lib/units'

const DAY_MS = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Cell {
  date: string
  activities: Activity[]
  kind?: ActivityKind
  level: number
}

/**
 * GitHub-style year grid. Each day is tinted by whichever type covered more
 * distance, and shaded 1–4 relative to that type's own typical day (so walk
 * days aren't washed out by long rides).
 */
export function CalendarGrid({ activities, year }: { activities: Activity[]; year: number }) {
  const { fmtDist } = useUnits()
  const [hover, setHover] = useState<Cell | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // On narrow screens start scrolled to the most recent weeks.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [year])

  const { weeks, monthCols } = useMemo(() => {
    const inYear = activities.filter((a) => a.startLocal.startsWith(String(year)))
    const byDay = groupByDay(inYear)

    // Per-kind scale: 90th percentile of daily distance for that kind.
    const p90 = (k: ActivityKind) => {
      const vals = [...byDay.values()]
        .map((list) => list.filter((a) => a.kind === k).reduce((s, a) => s + a.distance, 0))
        .filter(Boolean)
        .sort((a, b) => a - b)
      return vals[Math.floor((vals.length - 1) * 0.9)] || 1
    }
    const scale = { bike: p90('bike'), walk: p90('walk') }

    const jan1 = Date.UTC(year, 0, 1)
    const offset = (new Date(jan1).getUTCDay() + 6) % 7 // Monday-first rows
    const daysInYear = (Date.UTC(year + 1, 0, 1) - jan1) / DAY_MS
    const weeks: (Cell | null)[][] = []
    const monthCols: { label: string; col: number }[] = []
    for (let i = 0; i < offset + daysInYear; i++) {
      const col = Math.floor(i / 7)
      weeks[col] ??= []
      if (i < offset) {
        weeks[col].push(null)
        continue
      }
      const d = new Date(jan1 + (i - offset) * DAY_MS)
      const date = d.toISOString().slice(0, 10)
      if (d.getUTCDate() === 1) monthCols.push({ label: MONTHS[d.getUTCMonth()], col })
      const list = byDay.get(date) ?? []
      const bike = list.filter((a) => a.kind === 'bike').reduce((s, a) => s + a.distance, 0)
      const walk = list.filter((a) => a.kind === 'walk').reduce((s, a) => s + a.distance, 0)
      const kind: ActivityKind | undefined = !list.length ? undefined : bike / scale.bike >= walk / scale.walk ? 'bike' : 'walk'
      const ratio = kind ? (kind === 'bike' ? bike : walk) / scale[kind] : 0
      const level = !kind ? 0 : ratio < 0.3 ? 1 : ratio < 0.6 ? 2 : ratio < 0.95 ? 3 : 4
      weeks[col].push({ date, activities: list, kind, level })
    }
    return { weeks, monthCols }
  }, [activities, year])

  const activeDays = weeks.flat().filter((c) => c?.kind).length

  return (
    <div className="cal">
      <div className="cal__scroll" ref={scrollRef}>
        <div className="cal__inner" style={{ ['--weeks' as string]: weeks.length }} onMouseLeave={() => setHover(null)}>
          <div className="cal__months" aria-hidden>
            {monthCols.map((m) => (
              <span key={m.label} style={{ gridColumn: m.col + 1 }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="cal__days" aria-hidden>
            <span>Mon</span>
            <span />
            <span>Wed</span>
            <span />
            <span>Fri</span>
            <span />
            <span />
          </div>
          <div className="cal__grid" role="grid" aria-label={`Activity calendar for ${year}`}>
            {weeks.map((week, w) => (
              <div className="cal__week" key={w} role="row">
                {week.map((cell, d) =>
                  cell ? (
                    <button
                      key={cell.date}
                      role="gridcell"
                      className={`cal__cell ${cell.kind ? `cal__cell--${cell.kind} l${cell.level}` : ''}`}
                      aria-label={`${cell.date}: ${cell.activities.length} activities`}
                      onMouseEnter={() => setHover(cell)}
                      onFocus={() => setHover(cell)}
                      onClick={() => {
                        // Touch has no hover: the first tap shows the day, a second tap opens it.
                        if (hover?.date !== cell.date) {
                          setHover(cell)
                          if (matchMedia('(hover: none)').matches) return
                        }
                        const top = [...cell.activities].sort((a, b) => b.distance - a.distance)[0]
                        if (top) window.open(stravaUrl(top.id), '_blank', 'noopener')
                      }}
                    />
                  ) : (
                    <span key={`pad-${d}`} className="cal__cell cal__cell--pad" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="cal__foot">
        <div className="cal__status" aria-live="polite">
          {hover ? (
            <>
              <strong>{fmtDate(`${hover.date}T12:00:00`)}</strong>
              {hover.activities.length ? (
                hover.activities.map((a) => (
                  <span key={a.id}>
                    <i className={`dot dot--${a.kind}`} /> {a.name} · {fmtDist(a.distance)}
                  </span>
                ))
              ) : (
                <span className="muted">Rest day</span>
              )}
            </>
          ) : (
            <span className="muted">
              {activeDays} active days in {year}. Hover a day for details; click to open it on Strava.
            </span>
          )}
        </div>
        <div className="cal__legend" aria-hidden>
          {(['bike', 'walk'] as const).map((k) => (
            <span key={k} className="cal__legend-row">
              {k === 'bike' ? 'Rides' : 'Walks'}
              {[1, 2, 3, 4].map((l) => (
                <i key={l} className={`cal__cell cal__cell--${k} l${l}`} />
              ))}
            </span>
          ))}
          <span className="muted">shorter → longer</span>
        </div>
      </div>
    </div>
  )
}
