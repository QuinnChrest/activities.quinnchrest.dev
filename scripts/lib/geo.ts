import type { LatLng } from '../../src/lib/polyline.ts'

const R = 6371008.8

export function haversine(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180
  const dLat = (b[0] - a[0]) * toRad
  const dLng = (b[1] - a[1]) * toRad
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function pathLength(points: LatLng[]): number {
  let d = 0
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i])
  return d
}

/**
 * Douglas–Peucker simplification. Works in a local equirectangular projection
 * (meters), which is accurate enough at the scale of a single activity.
 */
export function simplify(points: LatLng[], toleranceMeters: number): LatLng[] {
  if (points.length <= 2) return points.slice()
  const lat0 = (points[0][0] * Math.PI) / 180
  const kx = (Math.PI / 180) * R * Math.cos(lat0)
  const ky = (Math.PI / 180) * R
  const xy = points.map(([lat, lng]) => [lng * kx, lat * ky] as const)

  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  const tol2 = toleranceMeters * toleranceMeters

  while (stack.length) {
    const [first, last] = stack.pop()!
    let maxD = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = segDist2(xy[i], xy[first], xy[last])
      if (d > maxD) {
        maxD = d
        index = i
      }
    }
    if (index !== -1 && maxD > tol2) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, i) => keep[i])
}

function segDist2(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  let [x, y] = a
  let dx = b[0] - x
  let dy = b[1] - y
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)
    if (t > 1) {
      x = b[0]
      y = b[1]
    } else if (t > 0) {
      x += dx * t
      y += dy * t
    }
  }
  dx = p[0] - x
  dy = p[1] - y
  return dx * dx + dy * dy
}
