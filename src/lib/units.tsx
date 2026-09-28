import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type UnitSystem = 'imperial' | 'metric'

const STORAGE_KEY = 'units'

function initialUnits(): UnitSystem {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'metric' || v === 'imperial') return v
  } catch {
    // storage unavailable (private mode etc.)
  }
  return 'imperial'
}

const UnitsContext = createContext<{ units: UnitSystem; setUnits: (u: UnitSystem) => void }>({
  units: 'imperial',
  setUnits: () => {},
})

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [units, setUnits] = useState<UnitSystem>(initialUnits)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, units)
    } catch {
      // ignore
    }
  }, [units])
  return <UnitsContext.Provider value={{ units, setUnits }}>{children}</UnitsContext.Provider>
}

export function useUnits() {
  const { units, setUnits } = useContext(UnitsContext)
  return { units, setUnits, ...formatters(units) }
}

const nf = (digits: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export function formatters(units: UnitSystem) {
  const imperial = units === 'imperial'
  const distUnit = imperial ? 'mi' : 'km'
  const elevUnit = imperial ? 'ft' : 'm'
  const speedUnit = imperial ? 'mph' : 'km/h'
  /** meters → mi|km as a number */
  const dist = (m: number) => (imperial ? m / 1609.344 : m / 1000)
  /** meters → ft|m as a number */
  const elev = (m: number) => (imperial ? m * 3.28084 : m)
  /** m/s → mph|km/h */
  const speed = (ms: number) => (imperial ? ms * 2.236936 : ms * 3.6)
  return {
    distUnit,
    elevUnit,
    speedUnit,
    dist,
    elev,
    speed,
    fmtDist: (m: number, digits?: number) => {
      const v = dist(m)
      return `${nf(digits ?? (v >= 100 ? 0 : 1)).format(v)} ${distUnit}`
    },
    fmtElev: (m: number) => `${nf(0).format(elev(m))} ${elevUnit}`,
    fmtSpeed: (ms: number) => `${nf(1).format(speed(ms))} ${speedUnit}`,
  }
}

export function UnitsToggle({ className = '' }: { className?: string }) {
  const { units, setUnits } = useUnits()
  return (
    <div className={`seg ${className}`} role="group" aria-label="Units">
      <button aria-pressed={units === 'imperial'} onClick={() => setUnits('imperial')}>
        mi
      </button>
      <button aria-pressed={units === 'metric'} onClick={() => setUnits('metric')}>
        km
      </button>
    </div>
  )
}
