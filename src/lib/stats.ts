import type { Activity, ActivityKind } from '../data/types'
import { site } from '../site.config'
import { localDate } from './format'

export interface Totals {
  count: number
  distance: number
  movingTime: number
  elevation: number
}

const emptyTotals = (): Totals => ({ count: 0, distance: 0, movingTime: 0, elevation: 0 })

export function totals(activities: Activity[]): Record<ActivityKind | 'all', Totals> {
  const out = { all: emptyTotals(), bike: emptyTotals(), walk: emptyTotals() }
  for (const a of activities) {
    for (const t of [out.all, out[a.kind]]) {
      t.count++
      t.distance += a.distance
      t.movingTime += a.movingTime
      t.elevation += a.elevationGain
    }
  }
  return out
}

export interface KindSplit {
  label: string
  bike: number
  walk: number
}

export const yearOf = (a: Activity) => Number(a.startLocal.slice(0, 4))
export const dayKey = (a: Activity) => a.startLocal.slice(0, 10)

export function distanceByYear(activities: Activity[]): KindSplit[] {
  const years = activities.map(yearOf)
  if (!years.length) return []
  const min = Math.min(...years)
  const max = Math.max(...years)
  const rows = new Map<number, KindSplit>()
  for (let y = min; y <= max; y++) rows.set(y, { label: String(y), bike: 0, walk: 0 })
  for (const a of activities) rows.get(yearOf(a))![a.kind] += a.distance
  return [...rows.values()]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function distanceByMonth(activities: Activity[], year: number | 'all'): KindSplit[] {
  const rows = MONTHS.map((label) => ({ label, bike: 0, walk: 0 }))
  for (const a of activities) {
    if (year !== 'all' && yearOf(a) !== year) continue
    rows[Number(a.startLocal.slice(5, 7)) - 1][a.kind] += a.distance
  }
  return rows
}

export interface Records {
  longestRide?: Activity
  longestWalk?: Activity
  biggestClimb?: Activity
  fastestRide?: Activity
  bestWeek?: { start: string; distance: number; count: number; top: Activity }
  longestStreak?: { start: string; end: string; days: number; top: Activity }
}

const maxBy = <T,>(arr: T[], f: (t: T) => number) =>
  arr.reduce<T | undefined>((best, x) => (best === undefined || f(x) > f(best) ? x : best), undefined)

export function records(activities: Activity[]): Records {
  const rides = activities.filter((a) => a.kind === 'bike')
  const walks = activities.filter((a) => a.kind === 'walk')

  // Weeks start on Monday.
  const weeks = new Map<string, Activity[]>()
  for (const a of activities) {
    const d = localDate(a.startLocal)
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    const key = d.toISOString().slice(0, 10)
    weeks.set(key, [...(weeks.get(key) ?? []), a])
  }
  const bestWeekEntry = maxBy([...weeks.entries()], ([, list]) => sum(list))
  const bestWeek = bestWeekEntry && {
    start: bestWeekEntry[0],
    distance: sum(bestWeekEntry[1]),
    count: bestWeekEntry[1].length,
    top: maxBy(bestWeekEntry[1], (a) => a.distance)!,
  }

  // Consecutive local days with at least one activity.
  const byDay = groupByDay(activities)
  const days = [...byDay.keys()].sort()
  let longestStreak: Records['longestStreak']
  let runStart = 0
  for (let i = 1; i <= days.length; i++) {
    const continues = i < days.length && dayDiff(days[i - 1], days[i]) === 1
    if (!continues) {
      const len = i - runStart
      if (!longestStreak || len > longestStreak.days) {
        const inRun = days.slice(runStart, i).flatMap((d) => byDay.get(d)!)
        longestStreak = { start: days[runStart], end: days[i - 1], days: len, top: maxBy(inRun, (a) => a.distance)! }
      }
      runStart = i
    }
  }

  return {
    longestRide: maxBy(rides, (a) => a.distance),
    longestWalk: maxBy(walks, (a) => a.distance),
    biggestClimb: maxBy(activities, (a) => a.elevationGain),
    fastestRide: maxBy(
      rides.filter((a) => a.distance >= site.fastestRideMinDistance),
      (a) => a.avgSpeed,
    ),
    bestWeek,
    longestStreak,
  }
}

const sum = (list: Activity[]) => list.reduce((s, a) => s + a.distance, 0)

export function groupByDay(activities: Activity[]) {
  const map = new Map<string, Activity[]>()
  for (const a of activities) map.set(dayKey(a), [...(map.get(dayKey(a)) ?? []), a])
  return map
}

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

export const EVEREST_M = 8848.86
export const EARTH_CIRCUMFERENCE_M = 40_075_017
export const MOON_DISTANCE_M = 384_400_000
export const MISSISSIPPI_M = 3_766_000
export const MARATHON_M = 42_195
