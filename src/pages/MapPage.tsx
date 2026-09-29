import {
  Map as MapLibre,
  NavigationControl,
  type ExpressionSpecification,
  type FilterSpecification,
  type PointLike,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../lib/maplibre-worker'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityCard } from '../components/ActivityCard'
import { Attribution } from '../components/Attribution'
import type { Activity, ActivityKind } from '../data/types'
import { useActivities } from '../data/useActivities'
import { fmtDate, intFmt, stravaUrl } from '../lib/format'
import { decodePolyline } from '../lib/polyline'
import { UnitsToggle, useUnits } from '../lib/units'
import { site } from '../site.config'
import './map.css'

// OpenFreeMap: free, no API key. Attribution (OpenFreeMap, OpenMapTiles, OSM)
// comes from the style's sources and is shown by MapLibre's attribution control.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'
const DEFAULT_CENTER: [number, number] = [-93.7941, 45.3055]

const SOURCE = 'routes'
const L_ROUTES = 'routes'
const L_HIT = 'routes-hit'
const L_GLOW = 'routes-highlight-glow'
const L_CORE = 'routes-highlight-core'

const kindColor: ExpressionSpecification = ['match', ['get', 'kind'], 'bike', site.colors.bike, site.colors.walk]
// Low per-line opacity: brightness comes from many activities stacking on the same road.
const baseOpacity: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 8, 0.12, 12, 0.16, 16, 0.3]
const DIMMED_OPACITY = 0.04

type Hover = { ids: string[]; x: number; y: number; pinned: boolean }

const isTouchDevice = () => window.matchMedia('(hover: none), (pointer: coarse)').matches

export default function MapPage() {
  const state = useActivities()
  const activities = state.status === 'ready' ? state.data.activities : undefined

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibre | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [touch] = useState(isTouchDevice)

  const [kinds, setKinds] = useState<Record<ActivityKind, boolean>>({ bike: true, walk: true })
  const [year, setYear] = useState<number | 'all'>('all')
  const [hover, setHover] = useState<Hover | null>(null)
  // focusId: a transient highlight (hovering a list item). selectedId: the chosen route.
  const [focusId, setFocusId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia('(max-width: 640px)').matches)

  const byId = useMemo(() => new Map(activities?.map((a) => [a.id, a])), [activities])
  const years = useMemo(
    () => [...new Set(activities?.map((a) => Number(a.startLocal.slice(0, 4))))].sort((a, b) => b - a),
    [activities],
  )
  const visible = useMemo(
    () =>
      activities?.filter(
        (a) => kinds[a.kind] && (year === 'all' || a.startLocal.startsWith(String(year))) && a.route.length,
      ) ?? [],
    [activities, kinds, year],
  )

  // Latest values for map event handlers registered once.
  const live = useRef({ byId, touch, hover, selectedId, selectRoute: (_id: string) => {} })

  // 1. Create the map.
  useEffect(() => {
    const map = new MapLibre({
      container: containerRef.current!,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: 11,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('load', () => setMapReady(true))
    mapRef.current = map
    if (import.meta.env.DEV) Object.assign(window, { __map: map })
    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  // 2. Add routes once both the map and the data are ready.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !activities) return

    const features = activities
      .filter((a) => a.route.length)
      .map((a) => ({
        type: 'Feature' as const,
        properties: { id: a.id, kind: a.kind, year: Number(a.startLocal.slice(0, 4)) },
        geometry: {
          type: 'MultiLineString' as const,
          // GeoJSON wants [lng, lat]
          coordinates: a.route.map((seg) => decodePolyline(seg).map(([lat, lng]) => [lng, lat])),
        },
      }))

    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features } })

    // Draw above every basemap line (roads, rail, boundaries) but under the
    // place labels that follow them, so town names stay readable. (The first
    // symbol layer overall is water names, which sit below the roads.)
    const styleLayers = map.getStyle().layers
    const lastLine = styleLayers.findLastIndex((l) => l.type === 'line')
    const beforeId = styleLayers.slice(lastLine + 1).find((l) => l.type === 'symbol')?.id

    map.addLayer(
      {
        id: L_HIT,
        type: 'line',
        source: SOURCE,
        paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': touch ? 22 : 14 },
      },
      beforeId,
    )
    map.addLayer(
      {
        id: L_ROUTES,
        type: 'line',
        source: SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': kindColor,
          'line-opacity': baseOpacity,
          'line-opacity-transition': { duration: 180, delay: 0 },
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 8, 0.8, 12, 1.6, 16, 4],
        },
      },
      beforeId,
    )
    map.addLayer(
      {
        id: L_GLOW,
        type: 'line',
        source: SOURCE,
        filter: ['in', ['get', 'id'], ['literal', []]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': kindColor,
          'line-opacity': 0.55,
          'line-blur': ['interpolate', ['linear'], ['zoom'], 8, 3, 16, 8],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 6, 16, 18],
        },
      },
      beforeId,
    )
    map.addLayer(
      {
        id: L_CORE,
        type: 'line',
        source: SOURCE,
        filter: ['in', ['get', 'id'], ['literal', []]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['match', ['get', 'kind'], 'bike', '#d4f6ff', '#ffd9ef'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.6, 16, 4.5],
        },
      },
      beforeId,
    )

    // Frame "home turf": the densest ~20 km cell of start points, grown to the
    // starts within ~30 km of it, so trips elsewhere don't pull the view away.
    const bounds = homeBounds(features.map((f) => f.geometry.coordinates[0][0] as [number, number]))
    if (bounds) map.fitBounds(bounds, { padding: 40, duration: 0 })

    // The hit layer is already wide (wider still on touch), so a point query is enough.
    const idsAt = (point: { x: number; y: number }) => {
      const at: PointLike = [point.x, point.y]
      const ids = new Set(map.queryRenderedFeatures(at, { layers: [L_HIT] }).map((f) => String(f.properties.id)))
      return [...ids].sort((a, b) =>
        (live.current.byId.get(b)?.start ?? '').localeCompare(live.current.byId.get(a)?.start ?? ''),
      )
    }

    const onMove = (e: { point: { x: number; y: number } }) => {
      if (live.current.touch) return
      const ids = idsAt(e.point)
      map.getCanvas().style.cursor = ids.length ? 'pointer' : ''
      // A pinned list or a selected route stays put until it's closed or something else is clicked.
      if (live.current.hover?.pinned || live.current.selectedId) return
      setFocusId(null)
      setHover(ids.length ? { ids, x: e.point.x, y: e.point.y, pinned: false } : null)
    }
    const onLeave = () => {
      if (!live.current.hover?.pinned) setHover(null)
    }
    const onClick = (e: { point: { x: number; y: number } }) => {
      const ids = idsAt(e.point)
      if (!ids.length) {
        // Clicking empty map clears everything.
        setHover(null)
        setFocusId(null)
        setSelectedId(null)
        return
      }
      if (ids.length === 1) {
        live.current.selectRoute(ids[0])
        return
      }
      // Several routes here: show a list (pinned on desktop so the pointer can move into it).
      setFocusId(null)
      setSelectedId(null)
      if (live.current.touch) setPanelOpen(false)
      setHover({ ids, x: e.point.x, y: e.point.y, pinned: true })
    }

    map.on('mousemove', onMove)
    map.on('click', onClick)
    map.getCanvas().addEventListener('mouseleave', onLeave)
    return () => {
      map.off('mousemove', onMove)
      map.off('click', onClick)
      map.getCanvas().removeEventListener('mouseleave', onLeave)
      for (const id of [L_CORE, L_GLOW, L_ROUTES, L_HIT]) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(SOURCE)) map.removeSource(SOURCE)
    }
  }, [mapReady, activities, touch])

  // 3. Type/year filters.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !map.getLayer(L_ROUTES)) return
    const shown = (Object.keys(kinds) as ActivityKind[]).filter((k) => kinds[k])
    const filter: FilterSpecification = [
      'all',
      ['in', ['get', 'kind'], ['literal', shown]],
      year === 'all' ? true : ['==', ['get', 'year'], year],
    ]
    map.setFilter(L_ROUTES, filter)
    map.setFilter(L_HIT, filter)
    setHover(null)
    setFocusId(null)
    setSelectedId(null)
  }, [kinds, year, mapReady, activities])

  // 4. Highlight hovered/selected routes and dim everything else.
  const highlightIds = selectedId ? [selectedId] : focusId ? [focusId] : (hover?.ids ?? [])
  const highlightKey = highlightIds.join(',')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !map.getLayer(L_ROUTES)) return
    const ids = highlightKey ? highlightKey.split(',') : []
    const f: FilterSpecification = ['in', ['get', 'id'], ['literal', ids]]
    map.setFilter(L_GLOW, f)
    map.setFilter(L_CORE, f)
    map.setPaintProperty(L_ROUTES, 'line-opacity', ids.length ? DIMMED_OPACITY : baseOpacity)
    // Many overlapping candidates: keep them visible but let a single focused route really pop.
    map.setPaintProperty(L_GLOW, 'line-opacity', ids.length > 1 ? 0.12 : 0.55)
    map.setPaintProperty(L_CORE, 'line-opacity', ids.length > 1 ? 0.35 : 1)
  }, [highlightKey, mapReady, activities])

  // When a route is selected, fit it into the part of the map not covered by UI:
  // between the filter panel and the bottom sheet on touch, and between the
  // filter panel and the selected-route card on desktop.
  useEffect(() => {
    const map = mapRef.current
    const a = selectedId ? byId.get(selectedId) : undefined
    if (!map || !a?.route.length) return
    const pts = a.route.flatMap((seg) => decodePolyline(seg))
    const lats = pts.map((p) => p[0])
    const lngs = pts.map((p) => p[1])
    const w = map.getContainer().clientWidth
    const h = map.getContainer().clientHeight
    const panel = document.querySelector('.panel')?.getBoundingClientRect()
    let padding: { top: number; bottom: number; left: number; right: number }
    if (touch) {
      const top = (panel?.bottom ?? 0) + 16
      const bottom = ((document.querySelector('.sheet') as HTMLElement | null)?.offsetHeight ?? 0) + 24
      // Always leave at least ~120px of map for the route itself.
      const squeeze = Math.min(1, (h - 120) / (top + bottom))
      padding = { top: top * squeeze, bottom: bottom * squeeze, left: 24, right: 24 }
    } else {
      const card = document.querySelector('.selected')?.getBoundingClientRect()
      const left = (panel?.right ?? 0) + 32
      const right = (card ? w - card.left : 0) + 32
      const squeeze = Math.min(1, (w - 200) / (left + right))
      padding = { top: 48, bottom: 48, left: left * squeeze, right: right * squeeze }
    }
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding, maxZoom: 16, duration: 700 },
    )
  }, [selectedId, touch, byId])

  // Choosing a route (clicking/tapping it on the map, or picking it from a list)
  // makes it the only highlighted route, shows its card, and zooms to it.
  const selectRoute = (id: string) => {
    setSelectedId(id)
    setHover(null)
    setFocusId(null)
    if (touch) setPanelOpen(false)
  }
  useEffect(() => {
    live.current = { byId, touch, hover, selectedId, selectRoute }
  })

  // Escape closes a pinned list / sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHover(null)
        setFocusId(null)
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hovered = hover?.ids.map((id) => byId.get(id)).filter((a): a is Activity => !!a) ?? []
  const selected = selectedId ? byId.get(selectedId) : undefined
  const clearAll = () => {
    setHover(null)
    setFocusId(null)
    setSelectedId(null)
  }

  return (
    <div className="map-page">
      <div ref={containerRef} className="map" />

      <ControlPanel
        open={panelOpen}
        onToggle={() => setPanelOpen((o) => !o)}
        activities={activities ?? []}
        visible={visible}
        kinds={kinds}
        setKinds={setKinds}
        years={years}
        year={year}
        setYear={setYear}
      />

      {state.status === 'loading' && <div className="map-status">Loading activities…</div>}
      {state.status === 'error' && <div className="map-status map-status--error">{state.error}</div>}

      {!touch && selected && <SelectedCard activity={selected} onClose={clearAll} />}
      {!touch && !selected && hover && hovered.length > 0 && (
        <HoverPopup
          hover={hover}
          activities={hovered}
          focusId={focusId}
          setFocusId={setFocusId}
          onSelect={selectRoute}
        />
      )}
      {touch && (selected || (hover && hovered.length > 0)) && (
        <BottomSheet list={hovered} selected={selected} onSelect={selectRoute} onClose={clearAll} />
      )}

      <div className="map-attribution">
        <Attribution activities={activities ?? []} compact />
      </div>
    </div>
  )
}

/** Bounds around the area with the most activity starts. Points are [lng, lat]. */
function homeBounds(starts: [number, number][]): [[number, number], [number, number]] | undefined {
  if (!starts.length) return undefined
  const CELL = 0.2 // degrees, roughly 15–20 km in the mid latitudes
  const counts = new Map<string, number>()
  for (const [lng, lat] of starts) {
    const key = `${Math.floor(lng / CELL)},${Math.floor(lat / CELL)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const [cx, cy] = best.split(',').map((n) => (Number(n) + 0.5) * CELL)
  const near = starts.filter(([lng, lat]) => Math.abs(lng - cx) < 0.4 && Math.abs(lat - cy) < 0.3)
  const lngs = near.map((s) => s[0])
  const lats = near.map((s) => s[1])
  const pad = 0.03
  return [
    [Math.min(...lngs) - pad, Math.min(...lats) - pad],
    [Math.max(...lngs) + pad, Math.max(...lats) + pad],
  ]
}

function ControlPanel(props: {
  open: boolean
  onToggle: () => void
  activities: Activity[]
  visible: Activity[]
  kinds: Record<ActivityKind, boolean>
  setKinds: (fn: (k: Record<ActivityKind, boolean>) => Record<ActivityKind, boolean>) => void
  years: number[]
  year: number | 'all'
  setYear: (y: number | 'all') => void
}) {
  const { open, onToggle, activities, visible, kinds, setKinds, years, year, setYear } = props
  const { fmtDist } = useUnits()
  const inYear = (a: Activity) => year === 'all' || a.startLocal.startsWith(String(year))
  const count = (k: ActivityKind) => activities.filter((a) => a.kind === k && inYear(a)).length
  const totalDist = visible.reduce((s, a) => s + a.distance, 0)

  return (
    <aside className={`panel ${open ? 'panel--open' : ''}`}>
      <header className="panel__head">
        <div>
          <h1 className="brand">{site.name}</h1>
          <p className="panel__summary">
            {intFmt.format(visible.length)} activities · {fmtDist(totalDist, 0)}
          </p>
        </div>
        <button className="panel__toggle" onClick={onToggle} aria-expanded={open} aria-label="Toggle filters">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M4 7h16M7 12h10M10 17h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="panel__body">
        <div className="kind-toggles">
          {(['bike', 'walk'] as const).map((k) => (
            <button
              key={k}
              className={`kind-toggle kind-toggle--${k}`}
              aria-pressed={kinds[k]}
              onClick={() => setKinds((prev) => ({ ...prev, [k]: !prev[k] }))}
            >
              <span className={`swatch swatch--${k}`} />
              <span className="kind-toggle__label">{k === 'bike' ? 'Rides' : 'Walks'}</span>
              <span className="kind-toggle__count">{intFmt.format(count(k))}</span>
            </button>
          ))}
        </div>

        <div className="years" role="group" aria-label="Year">
          <button className="chip" aria-pressed={year === 'all'} onClick={() => setYear('all')}>
            All years
          </button>
          {years.map((y) => (
            <button key={y} className="chip" aria-pressed={year === y} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>

        <div className="panel__foot">
          <UnitsToggle />
          <a className="nav-link" href="#/highlights">
            Highlights <span aria-hidden>→</span>
          </a>
        </div>
      </div>
    </aside>
  )
}

function HoverPopup(props: {
  hover: Hover
  activities: Activity[]
  focusId: string | null
  setFocusId: (id: string | null) => void
  onSelect: (id: string) => void
}) {
  const { hover, activities, focusId, setFocusId, onSelect } = props
  const { fmtDist } = useUnits()
  // The map fills the viewport, so the window size is the container size.
  const w = window.innerWidth
  const h = window.innerHeight
  const flipX = hover.x > w - 340
  const flipY = hover.y > h - (activities.length > 1 ? 400 : 260) && hover.y > h / 2
  const style = {
    left: hover.x + (flipX ? -16 : 16),
    top: hover.y + (flipY ? -16 : 16),
    transform: `translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})`,
  }

  if (activities.length === 1) {
    return (
      <div className="popup" style={style}>
        <ActivityCard activity={activities[0]} action="Click to select" />
      </div>
    )
  }

  return (
    <div className={`popup popup--list ${hover.pinned ? 'popup--pinned' : ''}`} style={style}>
      <div className="overlap">
        <div className="overlap__head">
          <strong>{activities.length} activities here</strong>
          <span>{hover.pinned ? 'Esc to close' : 'Click to pin'}</span>
        </div>
        <ul className="overlap__list" onMouseLeave={() => setFocusId(null)}>
          {activities.map((a) => (
            <li key={a.id}>
              <button
                className={`overlap__item ${focusId === a.id ? 'is-focus' : ''}`}
                onClick={() => onSelect(a.id)}
                onMouseEnter={() => setFocusId(a.id)}
                onFocus={() => setFocusId(a.id)}
              >
                <span className={`dot dot--${a.kind}`} />
                <span className="overlap__name">{a.name}</span>
                <span className="overlap__meta">
                  {fmtDate(a.startLocal, { weekday: undefined })} · {fmtDist(a.distance)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {hover.pinned && <div className="overlap__hint">Click an activity to select it</div>}
      </div>
    </div>
  )
}

/** Desktop: the selected route's card, pinned to the top-right corner. */
function SelectedCard({ activity: a, onClose }: { activity: Activity; onClose: () => void }) {
  return (
    <div className="selected" key={a.id} role="dialog" aria-label="Selected route">
      <div className="selected__bar">
        <span>Selected route</span>
        <button className="selected__close" onClick={onClose} aria-label="Close" title="Close (Esc)">
          ✕
        </button>
      </div>
      <ActivityCard activity={a} action="View on Strava" href={stravaUrl(a.id)} />
    </div>
  )
}

/** Touch: a sheet that slides up with the selected route's card, or a list to choose from. */
function BottomSheet(props: {
  list: Activity[]
  selected?: Activity
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const { list, selected, onSelect, onClose } = props
  const { fmtDist } = useUnits()

  return (
    // Keyed by content so switching from the list to a route slides the sheet up again.
    <div className="sheet" key={selected ? selected.id : 'list'} role="dialog" aria-label="Activity details">
      <div className="sheet__bar">
        <span className="sheet__title">{selected ? 'Selected route' : `${list.length} activities here`}</span>
        <button className="sheet__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {selected ? (
        <a className="sheet__card" href={stravaUrl(selected.id)} target="_blank" rel="noopener">
          <ActivityCard activity={selected} action="View on Strava" />
        </a>
      ) : (
        <ul className="overlap__list overlap__list--sheet">
          {list.map((a) => (
            <li key={a.id}>
              <button className="overlap__item" onClick={() => onSelect(a.id)}>
                <span className={`dot dot--${a.kind}`} />
                <span className="overlap__name">{a.name}</span>
                <span className="overlap__meta">
                  {fmtDate(a.startLocal, { weekday: undefined })} · {fmtDist(a.distance)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
