// Generates realistic-looking fake activities around Monticello, MN.
//
// A jittered road grid is laid over the area (with the Mississippi River
// cutting through it, crossable only at bridges). Each activity is a loop of
// shortest paths between random waypoints, so popular roads near "home" get
// traveled over and over, which is exactly what makes the heatmap glow.

import type { LatLng } from '../../src/lib/polyline.ts'
import { haversine, pathLength } from '../lib/geo.ts'
import type { RawActivity } from '../lib/pipeline.ts'

const CENTER: LatLng = [45.3055, -93.7941]
// Rural Minnesota roads mostly follow the 1-mile section grid; towns have
// ~quarter-mile blocks. Nodes sit on a quarter-mile grid; outside town only the
// section lines (every 4th row/column) plus a few extra roads get edges.
const SPACING = 402 // meters (1/4 mile)
const COLS = 120
const ROWS = 100
const TOWN_RADIUS = 2600 // meters

const M_PER_DEG_LAT = 111_320
const M_PER_DEG_LNG = 111_320 * Math.cos((CENTER[0] * Math.PI) / 180)

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rng = () => number
const pick = <T,>(rng: Rng, arr: readonly T[]) => arr[Math.floor(rng() * arr.length)]
const between = (rng: Rng, a: number, b: number) => a + rng() * (b - a)

interface Graph {
  nodes: LatLng[]
  adj: { to: number; w: number }[][]
  home: number
  trailheads: number[]
  routable: boolean[]
}

/** Latitude of the river's centerline at a given longitude (flows roughly WNW → ESE). */
function riverLat(lng: number) {
  const x = (lng - CENTER[1]) * M_PER_DEG_LNG
  return CENTER[0] + (900 - x * 0.12 + 350 * Math.sin(x / 2600)) / M_PER_DEG_LAT
}

function buildGraph(rng: Rng): Graph {
  const nodes: LatLng[] = []
  const inTown: boolean[] = []
  const idx = (c: number, r: number) => r * COLS + c
  // Each section line drifts a little so the grid isn't perfectly regular.
  const colDrift = Array.from({ length: COLS }, () => between(rng, -25, 25))
  const rowDrift = Array.from({ length: ROWS }, () => between(rng, -25, 25))
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const dx = (c - COLS / 2) * SPACING + colDrift[c] + between(rng, -8, 8)
      const dy = (r - ROWS / 2) * SPACING + rowDrift[r] + between(rng, -8, 8)
      nodes.push([CENTER[0] + dy / M_PER_DEG_LAT, CENTER[1] + dx / M_PER_DEG_LNG])
      inTown.push(Math.hypot(dx, dy) < TOWN_RADIUS)
    }
  }
  const adj: Graph['adj'] = nodes.map(() => [])
  // Bridges: one downtown and a couple of county-road crossings, all on section lines.
  const mid = Math.round(COLS / 2 / 4) * 4
  const bridgeCols = new Set([mid, mid - 24, mid + 28])
  const connect = (a: number, b: number) => {
    const w = haversine(nodes[a], nodes[b])
    adj[a].push({ to: b, w })
    adj[b].push({ to: a, w })
  }
  // A road segment exists if it's on a section line (occasionally missing), in
  // town (most blocks), or rarely as an extra rural road.
  const hasRoad = (onSection: boolean, town: boolean) =>
    onSection ? rng() > 0.04 : town ? rng() > 0.2 : rng() < 0.03
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = idx(c, r)
      if (c + 1 < COLS) {
        const b = idx(c + 1, r)
        if (hasRoad(r % 4 === 0, inTown[a] && inTown[b]) && !crossesRiver(nodes[a], nodes[b])) connect(a, b)
      }
      if (r + 1 < ROWS) {
        const b = idx(c, r + 1)
        const crosses = crossesRiver(nodes[a], nodes[b])
        if (crosses ? bridgeCols.has(c) : hasRoad(c % 4 === 0, inTown[a] && inTown[b])) connect(a, b)
      }
    }
  }
  // Only route between nodes that are actually on a road.
  const routable = nodes.map((_, i) => adj[i].length > 0)
  const near = (p: LatLng) => nearest(nodes, p, routable)
  // Home: a few blocks south of downtown. Trailheads: river parks and lakes.
  const home = near([CENTER[0] - 0.012, CENTER[1] + 0.006])
  const trailheads = [
    near([CENTER[0] + 0.004, CENTER[1] - 0.01]),
    near([CENTER[0] - 0.05, CENTER[1] - 0.06]),
    near([CENTER[0] + 0.035, CENTER[1] + 0.05]),
  ]
  return { nodes, adj, home, trailheads, routable }
}

function crossesRiver(a: LatLng, b: LatLng) {
  return a[0] > riverLat(a[1]) !== b[0] > riverLat(b[1])
}

function nearest(nodes: LatLng[], p: LatLng, allowed?: boolean[]) {
  let best = 0
  let bestD = Infinity
  nodes.forEach((n, i) => {
    if (allowed && !allowed[i]) return
    const d = haversine(n, p)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** Dijkstra with per-activity edge noise, so repeat trips mostly (not always) take the same roads. */
function shortestPath(g: Graph, from: number, to: number, rng: Rng, noise: number): number[] {
  const dist = new Float64Array(g.nodes.length).fill(Infinity)
  const prev = new Int32Array(g.nodes.length).fill(-1)
  const heap: [number, number][] = [[0, from]]
  dist[from] = 0
  while (heap.length) {
    const [d, u] = heapPop(heap)
    if (u === to) break
    if (d > dist[u]) continue
    for (const { to: v, w } of g.adj[u]) {
      const nd = d + w * (1 + rng() * noise)
      if (nd < dist[v]) {
        dist[v] = nd
        prev[v] = u
        heapPush(heap, [nd, v])
      }
    }
  }
  if (prev[to] === -1 && from !== to) return [from]
  const path: number[] = []
  for (let u = to; u !== -1; u = prev[u]) path.push(u)
  return path.reverse()
}

function heapPush(h: [number, number][], item: [number, number]) {
  h.push(item)
  let i = h.length - 1
  while (i > 0) {
    const p = (i - 1) >> 1
    if (h[p][0] <= h[i][0]) break
    ;[h[p], h[i]] = [h[i], h[p]]
    i = p
  }
}

function heapPop(h: [number, number][]): [number, number] {
  const top = h[0]
  const last = h.pop()!
  if (h.length) {
    h[0] = last
    let i = 0
    for (;;) {
      const l = 2 * i + 1
      const r = l + 1
      let m = i
      if (l < h.length && h[l][0] < h[m][0]) m = l
      if (r < h.length && h[r][0] < h[m][0]) m = r
      if (m === i) break
      ;[h[m], h[i]] = [h[i], h[m]]
      i = m
    }
  }
  return top
}

/** Turns a node path into a dense GPS-like track with a little per-activity jitter. */
function toTrack(g: Graph, path: number[], rng: Rng): LatLng[] {
  const pts: LatLng[] = []
  const lane = between(rng, -2.5, 2.5) // which side of the road
  for (let i = 1; i < path.length; i++) {
    const a = g.nodes[path[i - 1]]
    const b = g.nodes[path[i]]
    const steps = Math.max(1, Math.round(haversine(a, b) / 12))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const n = () => (lane + between(rng, -1.5, 1.5)) / M_PER_DEG_LAT
      pts.push([a[0] + (b[0] - a[0]) * t + n(), a[1] + (b[1] - a[1]) * t + n()])
    }
  }
  pts.push(g.nodes[path[path.length - 1]])
  return pts
}

function makeLoop(g: Graph, start: number, targetMeters: number, rng: Rng): LatLng[] {
  const waypointCount = targetMeters > 20_000 ? 3 : 2
  const radius = targetMeters / (waypointCount === 3 ? 4.2 : 3.4)
  const heading = rng() * Math.PI * 2
  const waypoints: number[] = []
  for (let i = 0; i < waypointCount; i++) {
    const ang = heading + (i - (waypointCount - 1) / 2) * between(rng, 0.7, 1.2)
    const r = radius * between(rng, 0.8, 1.15)
    const s = g.nodes[start]
    waypoints.push(
      nearest(
        g.nodes,
        [s[0] + (Math.sin(ang) * r) / M_PER_DEG_LAT, s[1] + (Math.cos(ang) * r) / M_PER_DEG_LNG],
        g.routable,
      ),
    )
  }
  const stops = [start, ...waypoints, start]
  const nodePath: number[] = [start]
  let at = start
  for (const stop of stops.slice(1)) {
    const leg = shortestPath(g, at, stop, rng, 0.35)
    if (leg.length < 2) continue // unreachable waypoint (isolated road): skip it
    nodePath.push(...leg.slice(1))
    at = stop
  }
  return toTrack(g, nodePath, rng)
}

const RIDE_NAMES = ['Morning Ride', 'Lunch Ride', 'Afternoon Ride', 'Evening Ride']
const WALK_NAMES = ['Morning Walk', 'Lunch Walk', 'Afternoon Walk', 'Evening Walk', 'Night Walk']
const FUN_RIDE_NAMES = [
  'River loop', 'Headwind both ways??', 'Chasing the sunset', 'Coffee run', 'Gravel detour',
  'First warm ride of the year', 'Corn as far as the eye can see', 'Beat the storm', 'Easy spin',
  'Tailwind home, finally', 'Hill repeats (Minnesota edition)', 'Bridge to bridge',
]
const FUN_WALK_NAMES = [
  'Dog walk', 'River walk', 'Snowy stroll', 'Walking meeting', 'Fall colors', 'Post-dinner loop',
  'Park loop', 'Frosty morning', 'Golden hour walk',
]

function timeOfDayName(hour: number, names: readonly string[]) {
  if (hour < 11) return names[0]
  if (hour < 14) return names[1]
  if (hour < 17) return names[2]
  if (hour < 21 || names.length < 5) return names[3]
  return names[4]
}

/** Chicago-ish UTC offset (hours): CDT roughly mid-March to early November. */
function centralOffset(month: number, day: number) {
  const dst = (month > 2 && month < 10) || (month === 2 && day >= 10) || (month === 10 && day < 3)
  return dst ? 5 : 6
}

export function generateSampleActivities(seed = 42): RawActivity[] {
  const rng = mulberry32(seed)
  const g = buildGraph(rng)
  const out: RawActivity[] = []
  let id = 5_210_000_000

  const first = new Date(Date.UTC(2021, 3, 1))
  const last = new Date(Date.UTC(2026, 8, 27))
  for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth()
    const day = d.getUTCDate()
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6
    const summer = Math.sin(((m - 1.5) / 12) * Math.PI * 2) // -1 in Jan … +1 in Jul
    const yearBoost = 1 + (y - 2021) * 0.08

    const rideP = Math.max(0, 0.08 + 0.26 * summer) * (weekend ? 1.8 : 1) * yearBoost
    const walkP = (0.22 + 0.1 * summer) * (weekend ? 1.3 : 1)

    const kinds: ('bike' | 'walk')[] = []
    if (rng() < rideP) kinds.push('bike')
    if (rng() < walkP) kinds.push('walk')

    for (const kind of kinds) {
      const bike = kind === 'bike'
      let target = bike
        ? weekend && rng() < 0.35
          ? between(rng, 50_000, 95_000)
          : between(rng, 16_000, 45_000)
        : between(rng, 2_000, 7_500)
      if (bike && summer > 0.6 && weekend && rng() < 0.06) target = between(rng, 140_000, 165_000)
      if (!bike && weekend && rng() < 0.12) target = between(rng, 9_000, 16_000)

      const start = !bike && rng() < 0.3 ? pick(rng, g.trailheads) : bike && rng() < 0.1 ? pick(rng, g.trailheads) : g.home
      const points = makeLoop(g, start, target, rng)
      const distance = pathLength(points)
      if (distance < 1000) continue

      const speed = bike ? between(rng, 5.8, 8.2) * (distance > 100_000 ? 0.9 : 1) : between(rng, 1.25, 1.65)
      const hour = bike
        ? pick(rng, weekend ? [7, 8, 9, 10, 14] : [6, 17, 18, 18, 19])
        : pick(rng, [7, 12, 12, 17, 18, 19, 20, 21])
      const minute = Math.floor(rng() * 60)
      const startUtc = new Date(Date.UTC(y, m, day, hour + centralOffset(m, day), minute, Math.floor(rng() * 60)))

      const useFunName = rng() < 0.22
      const name = useFunName
        ? pick(rng, bike ? FUN_RIDE_NAMES : FUN_WALK_NAMES)
        : timeOfDayName(hour, bike ? RIDE_NAMES : WALK_NAMES)

      id += 1 + Math.floor(rng() * 400_000)
      out.push({
        id: String(id),
        name,
        sportType: bike ? (rng() < 0.12 ? 'GravelRide' : 'Ride') : rng() < 0.1 ? 'Hike' : 'Walk',
        start: startUtc,
        distance,
        movingTime: distance / speed,
        elevationGain: (distance / 1000) * (bike ? between(rng, 3.5, 7.5) : between(rng, 2, 6)),
        avgSpeed: speed,
        device: bike ? (rng() < 0.85 ? 'garmin' : undefined) : rng() < 0.2 ? 'garmin' : undefined,
        points,
      })
    }
  }
  return out
}
