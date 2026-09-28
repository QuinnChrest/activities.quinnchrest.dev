// Reads a Strava bulk export ("Download your account" archive, unzipped):
//   <dir>/activities.csv
//   <dir>/activities/<id>.gpx | .tcx | .fit, optionally .gz

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { Decoder, Stream } from '@garmin/fitsdk'
import { parse as parseCsv } from 'csv-parse/sync'
import { XMLParser } from 'fast-xml-parser'
import type { LatLng } from '../../src/lib/polyline.ts'
import { pathLength } from '../lib/geo.ts'
import { kindForSportType, type RawActivity } from '../lib/pipeline.ts'

interface Track {
  points: LatLng[]
  firstTime?: Date
  device?: 'garmin'
}

export interface ExportReadResult {
  activities: RawActivity[]
  skipped: { id: string; reason: string }[]
}

export function readStravaExport(dir: string): ExportReadResult {
  const csvPath = join(dir, 'activities.csv')
  if (!existsSync(csvPath)) throw new Error(`No activities.csv in ${dir}. Point this at the unzipped export folder.`)

  const rows: string[][] = parseCsv(readFileSync(csvPath), { bom: true, relax_column_count: true })
  const header = rows.shift() ?? []
  const col = columnLookup(header)

  const activities: RawActivity[] = []
  const skipped: ExportReadResult['skipped'] = []

  for (const row of rows) {
    const id = col(row, 'Activity ID')
    const sportType = col(row, 'Activity Type') ?? ''
    if (!id) continue
    if (!kindForSportType(sportType)) {
      skipped.push({ id, reason: `type "${sportType}"` })
      continue
    }
    const filename = col(row, 'Filename')
    if (!filename) {
      skipped.push({ id, reason: 'no GPS file (manual/indoor)' })
      continue
    }
    const filePath = join(dir, filename)
    if (!existsSync(filePath)) {
      skipped.push({ id, reason: `missing ${filename}` })
      continue
    }

    let track: Track
    try {
      track = readTrack(filePath)
    } catch (err) {
      skipped.push({ id, reason: `could not parse ${filename}: ${(err as Error).message}` })
      continue
    }
    if (track.points.length < 2) {
      skipped.push({ id, reason: 'no GPS points' })
      continue
    }

    // The export repeats some headers: the first "Distance"/"Elapsed Time" are in
    // display units, the last are meters/seconds. `last` picks the SI ones.
    const distance = num(col(row, 'Distance', 'last')) || pathLength(track.points)
    const movingTime = num(col(row, 'Moving Time')) || num(col(row, 'Elapsed Time', 'last'))
    const start = parseStravaDate(col(row, 'Activity Date')) ?? track.firstTime
    if (!start) {
      skipped.push({ id, reason: 'no start date' })
      continue
    }

    activities.push({
      id,
      name: col(row, 'Activity Name') || sportType,
      sportType: sportType.replace(/\s+/g, ''),
      start,
      distance,
      movingTime,
      elevationGain: num(col(row, 'Elevation Gain')),
      avgSpeed: num(col(row, 'Average Speed')) || (movingTime ? distance / movingTime : 0),
      device: track.device,
      points: track.points,
    })
  }
  return { activities, skipped }
}

function columnLookup(header: string[]) {
  const positions = new Map<string, number[]>()
  header.forEach((h, i) => {
    const key = h.trim()
    positions.set(key, [...(positions.get(key) ?? []), i])
  })
  return (row: string[], name: string, which: 'first' | 'last' = 'first') => {
    const idx = positions.get(name)
    if (!idx) return undefined
    const v = row[which === 'first' ? idx[0] : idx[idx.length - 1]]
    return v?.trim() || undefined
  }
}

function num(v: string | undefined) {
  const n = Number(v?.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** "Jun 3, 2021, 11:22:33 PM" (UTC) → Date */
function parseStravaDate(v: string | undefined): Date | undefined {
  if (!v) return undefined
  const m = v.match(/^(\w{3}) (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i)
  if (m) {
    const month = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[1].toLowerCase()) / 3
    let hour = Number(m[4]) % 12
    if (m[7]?.toUpperCase() === 'PM') hour += 12
    else if (!m[7]) hour = Number(m[4])
    if (month >= 0) return new Date(Date.UTC(Number(m[3]), month, Number(m[2]), hour, Number(m[5]), Number(m[6])))
  }
  const d = new Date(v.endsWith('Z') ? v : `${v} UTC`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function readTrack(path: string): Track {
  let buf = readFileSync(path)
  const lower = path.toLowerCase()
  if (lower.endsWith('.gz')) buf = gunzipSync(buf)
  const base = lower.replace(/\.gz$/, '')
  if (base.endsWith('.fit')) return readFit(buf)
  if (base.endsWith('.gpx')) return readGpx(buf.toString('utf8'))
  if (base.endsWith('.tcx')) return readTcx(buf.toString('utf8').trimStart())
  throw new Error('unsupported file type')
}

const SEMI_TO_DEG = 180 / 2 ** 31

function readFit(buf: Buffer): Track {
  const decoder = new Decoder(Stream.fromBuffer(buf))
  const { messages, errors } = decoder.read()
  if (!messages.recordMesgs?.length && errors.length) throw errors[0]
  const points: LatLng[] = []
  let firstTime: Date | undefined
  for (const r of messages.recordMesgs ?? []) {
    if (r.positionLat == null || r.positionLong == null) continue
    points.push([r.positionLat * SEMI_TO_DEG, r.positionLong * SEMI_TO_DEG])
    if (!firstTime && r.timestamp) firstTime = new Date(r.timestamp)
  }
  const manufacturer = String(messages.fileIdMesgs?.[0]?.manufacturer ?? '')
  return { points, firstTime, device: manufacturer.toLowerCase() === 'garmin' ? 'garmin' : undefined }
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name) => ['trk', 'trkseg', 'trkpt', 'Activity', 'Lap', 'Track', 'Trackpoint'].includes(name),
})

function readGpx(text: string): Track {
  const gpx = xml.parse(text).gpx
  const points: LatLng[] = []
  let firstTime: Date | undefined
  for (const trk of gpx?.trk ?? []) {
    for (const seg of trk.trkseg ?? []) {
      for (const pt of seg.trkpt ?? []) {
        const lat = Number(pt.lat)
        const lon = Number(pt.lon)
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
        points.push([lat, lon])
        if (!firstTime && pt.time) firstTime = new Date(pt.time)
      }
    }
  }
  const creator = String(gpx?.creator ?? '')
  return { points, firstTime, device: /garmin/i.test(creator) ? 'garmin' : undefined }
}

function readTcx(text: string): Track {
  const db = xml.parse(text).TrainingCenterDatabase
  const points: LatLng[] = []
  let firstTime: Date | undefined
  let device: Track['device']
  for (const act of db?.Activities?.Activity ?? []) {
    if (/garmin|forerunner|edge|fenix|venu|vivo/i.test(String(act.Creator?.Name ?? ''))) device = 'garmin'
    for (const lap of act.Lap ?? []) {
      for (const track of lap.Track ?? []) {
        for (const tp of track.Trackpoint ?? []) {
          const lat = Number(tp.Position?.LatitudeDegrees)
          const lon = Number(tp.Position?.LongitudeDegrees)
          if (!Number.isFinite(lat) || !Number.isFinite(lon) || !tp.Position) continue
          points.push([lat, lon])
          if (!firstTime && tp.Time) firstTime = new Date(tp.Time)
        }
      }
    }
  }
  return { points, firstTime, device }
}
