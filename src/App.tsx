import { lazy, Suspense, useEffect, useState } from 'react'
import { UnitsProvider } from './lib/units'
import MapPage from './pages/MapPage'
import { site } from './site.config'

const HighlightsPage = lazy(() => import('./pages/HighlightsPage'))

export type Route = 'map' | 'highlights'

// Hash routing keeps GitHub Pages happy without a 404.html redirect trick.
function currentRoute(): Route {
  return location.hash.startsWith('#/highlights') ? 'highlights' : 'map'
}

export default function App() {
  const [route, setRoute] = useState<Route>(currentRoute)

  useEffect(() => {
    const onHash = () => {
      setRoute(currentRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    document.title = route === 'map' ? site.name : `Highlights · ${site.name}`
  }, [route])

  return (
    <UnitsProvider>
      {route === 'map' ? (
        <MapPage />
      ) : (
        <Suspense fallback={<div className="page-loading">Loading…</div>}>
          <HighlightsPage />
        </Suspense>
      )}
    </UnitsProvider>
  )
}
