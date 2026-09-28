import { useState } from 'react'
import type { KindSplit } from '../lib/stats'

interface Props {
  data: KindSplit[]
  /** meters → display number */
  toValue: (m: number) => number
  unit: string
  height?: number
  caption: string
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function niceStep(max: number, target = 4) {
  const raw = max / target
  const pow = 10 ** Math.floor(Math.log10(raw || 1))
  const n = raw / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow
}

/** Stacked columns (rides at the base, walks on top) with a per-column hover tooltip and a table view. */
export function StackedBars({ data, toValue, unit, height = 220, caption }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const rows = data.map((d) => ({ label: d.label, bike: toValue(d.bike), walk: toValue(d.walk) }))
  const totals = rows.map((r) => r.bike + r.walk)
  const maxTotal = Math.max(...totals, 0)
  const step = niceStep(maxTotal)
  const top = Math.max(step, Math.ceil(maxTotal / step) * step)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const peak = totals.indexOf(maxTotal)
  const pct = (v: number) => `${(v / top) * 100}%`

  return (
    <figure className="bars">
      <div className="bars__plot" style={{ height }}>
        <div className="bars__grid" aria-hidden>
          {ticks.map((t) => (
            <div key={t} className="bars__tick" style={{ bottom: pct(t) }}>
              <span>{nf.format(t)}</span>
            </div>
          ))}
        </div>
        <div className="bars__cols" onMouseLeave={() => setHover(null)}>
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`bars__col ${hover === i ? 'is-hover' : ''} ${hover !== null && hover !== i ? 'is-dim' : ''}`}
              onMouseEnter={() => setHover(i)}
              onClick={() => setHover(i)}
            >
              <div className="bars__stack" style={{ height: pct(totals[i]) }}>
                {r.walk > 0 && <div className="bars__seg bars__seg--walk" style={{ flexGrow: r.walk }} />}
                {r.bike > 0 && <div className="bars__seg bars__seg--bike" style={{ flexGrow: r.bike }} />}
                {i === peak && maxTotal > 0 && hover === null && (
                  <span className="bars__peak">{nf.format(maxTotal)}</span>
                )}
              </div>
              {hover === i && (
                <div className={`tip ${i > rows.length / 2 ? 'tip--left' : ''}`} role="status">
                  <strong>{r.label}</strong>
                  <span>
                    <i className="dot dot--bike" /> Rides <b>{nf.format(r.bike)} {unit}</b>
                  </span>
                  <span>
                    <i className="dot dot--walk" /> Walks <b>{nf.format(r.walk)} {unit}</b>
                  </span>
                  <span className="tip__total">
                    Total <b>{nf.format(totals[i])} {unit}</b>
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="bars__labels" aria-hidden>
        {rows.map((r) => (
          <span key={r.label}>{r.label}</span>
        ))}
      </div>
      <details className="table-view">
        <summary>Show as table</summary>
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col"></th>
              <th scope="col">Rides ({unit})</th>
              <th scope="col">Walks ({unit})</th>
              <th scope="col">Total ({unit})</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{nf.format(r.bike)}</td>
                <td>{nf.format(r.walk)}</td>
                <td>{nf.format(totals[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
