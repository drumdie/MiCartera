import { useEffect, useState } from 'react'
import { apiGet } from '../../services/apiClient'

// Mini-gráfico de una serie histórica (MEP / CCL / riesgo país) con toggle de rango.
// La data es diaria (argentinadatos), así que el rango mínimo es 1 semana.
const RANGOS = [
  { id: 'semana', label: '1S', dias: 7 },
  { id: 'mes',    label: '1M', dias: 30 },
  { id: 'tres',   label: '3M', dias: 90 },
  { id: 'anio',   label: '1A', dias: 365 },
]

const fmtNum = (v, u) => u === 'pb'
  ? `${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })} pb`
  : `$${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`

const fmtFecha = (f) => {
  const [y, m, d] = String(f).split('-')
  return d ? `${d}/${m}` : f
}

export default function SerieChart({ indicador, unidad = '' }) {
  const [serie, setSerie] = useState(null)   // null = cargando; [] = error/sin datos
  const [rango, setRango] = useState('mes')

  useEffect(() => {
    let alive = true
    setSerie(null)
    apiGet(`/api/prices/series/${indicador}?dias=400`)
      .then(d => { if (alive) setSerie(Array.isArray(d?.serie) ? d.serie : []) })
      .catch(() => { if (alive) setSerie([]) })
    return () => { alive = false }
  }, [indicador])

  if (serie === null) {
    return <div style={{ fontSize: 11, color: 'var(--muted)', padding: '10px 0' }}>Cargando serie…</div>
  }
  if (serie.length < 2) return null

  const dias = RANGOS.find(r => r.id === rango)?.dias ?? 30
  const pts  = serie.slice(-dias)
  if (pts.length < 2) return null

  const vals = pts.map(p => p.valor)
  const minV = Math.min(...vals)
  const maxV = Math.max(...vals)
  const rangeV = (maxV - minV) || 1

  const W = 320, H = 56, P = 4
  const x = (i) => P + (i / (pts.length - 1)) * (W - 2 * P)
  const y = (v) => P + (1 - (v - minV) / rangeV) * (H - 2 * P)
  const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${x(pts.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`

  const primero = pts[0].valor
  const ultimo  = pts[pts.length - 1].valor
  const delta   = ultimo - primero
  const deltaPct = primero ? (delta / primero) * 100 : 0
  const sube = delta >= 0
  const color = 'var(--accent)'

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>Evolución</span>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4 }}>
          {RANGOS.map(r => (
            <button key={r.id} onClick={() => setRango(r.id)}
              style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                border: '1px solid var(--border)',
                background: rango === r.id ? 'var(--surface3)' : 'transparent',
                color: rango === r.id ? '#fff' : 'var(--muted2)',
              }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 56, display: 'block' }}>
        <path d={areaPath} fill={color} opacity="0.08" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <circle cx={x(pts.length - 1)} cy={y(ultimo)} r="2.5" fill={color} vectorEffect="non-scaling-stroke" />
      </svg>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>
          {fmtFecha(pts[0].fecha)} → {fmtFecha(pts[pts.length - 1].fecha)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted2)' }}>
          {sube ? '▲' : '▼'} {sube ? '+' : ''}{fmtNum(delta, unidad)} ({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1).replace('.', ',')}%)
        </span>
      </div>
    </div>
  )
}
