// Google encoded polyline format, precision 5. Points are [lat, lng].

export type LatLng = [number, number]

export function encodePolyline(points: LatLng[]): string {
  let out = ''
  let prevLat = 0
  let prevLng = 0
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5)
    const iLng = Math.round(lng * 1e5)
    out += encodeValue(iLat - prevLat) + encodeValue(iLng - prevLng)
    prevLat = iLat
    prevLng = iLng
  }
  return out
}

function encodeValue(v: number): string {
  let n = v < 0 ? ~(v << 1) : v << 1
  let out = ''
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63)
    n >>= 5
  }
  return out + String.fromCharCode(n + 63)
}

export function decodePolyline(str: string): LatLng[] {
  const points: LatLng[] = []
  let i = 0
  let lat = 0
  let lng = 0
  while (i < str.length) {
    for (let axis = 0; axis < 2; axis++) {
      let shift = 0
      let result = 0
      let b: number
      do {
        b = str.charCodeAt(i++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += delta
      else lng += delta
    }
    points.push([lat / 1e5, lng / 1e5])
  }
  return points
}
