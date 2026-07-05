import { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '../../services/apiClient'

// Gráfico histórico estilo TradingView para cotizaciones (MEP/CCL/Oficial) y riesgo país.
// Multi-línea con leyenda toggeable, grilla, rangos largos y crosshair táctil con tooltip.
// La data es diaria (argentinadatos vía backend /api/prices/series/{id}).
const RANGOS = [
  { id: '1m',  label: '1M',  dias: 31 },
  { id: '3m',  label: '3M',  dias: 92 },
  { id: '1a',  label: '1A',  dias: 366 },
  { id: '5a',  label: '5A',  dias: 1830 },
  { id: 'max', label: 'Máx', dias: Infinity },
]

const W = 380, H = 150, PAD_T = 8, PAD_B = 16, PAD_R = 40
const MAX_PTS = 420   // downsample para render fluido en rangos largos

const fmtVal = (v, u) => u === 'pb'
  ? Math.round(v).toLocaleString('es-AR')
  : Math.round(v).toLocaleString('es-AR')
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtTickFecha = (ms, largo) => {
  const d = new Date(ms)
  return largo ? `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
               : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
const fmtFechaFull = (ms) => {
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
}

function downsample(pts) {
  if (pts.length <= MAX_PTS) return pts
  const stride = Math.ceil(pts.length / MAX_PTS)
  const out = []
  for (let i = 0; i < pts.length; i += stride) out.push(pts[i])
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1])
  return out
}

// Índice del punto más cercano a un timestamp (array ordenado por t)
function nearestIdx(pts, t) {
  let lo = 0, hi = pts.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].t < t) lo = mid; else hi = mid
  }
  return (t - pts[lo].t) < (pts[hi].t - t) ? lo : hi
}

export default function HistoryChart({ titulo, series, unidad = 'ARS', defaultRango = '3m' }) {
  const [data, setData]   = useState(null)      // { id: [{t, valor}] } | null cargando | {} error
  const [rango, setRango] = useState(defaultRango)
  const [off, setOff]     = useState({})        // series apagadas por el usuario
  const [cursor, setCursor] = useState(null)    // { t } crosshair
  const boxRef = useRef(null)

  useEffect(() => {
    let alive = true
    Promise.all(series.map(s =>
      apiGet(`/api/prices/series/${s.id}?dias=10000`)
        .then(d => [s.id, (d?.serie ?? []).map(p => ({ t: Date.parse(p.fecha), valor: p.valor })).filter(p => Number.isFinite(p.t))])
        .catch(() => [s.id, []])
    )).then(entries => { if (alive) setData(Object.fromEntries(entries)) })
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.map(s => s.id).join(',')])

  const view = useMemo(() => {
    if (!data) return null
    const dias = RANGOS.find(r => r.id === rango)?.dias ?? 92
    const cut = dias === Infinity ? -Infinity : Date.now() - dias * 86400_000
    const vis = series
      .filter(s => !off[s.id])
      .map(s => ({ ...s, pts: downsample((data[s.id] ?? []).filter(p => p.t >= cut)) }))
      .filter(s => s.pts.length >= 2)
    if (vis.length === 0) return { vis: [] }

    let tMin = Infinity, tMax = -Infinity, vMin = Infinity, vMax = -Infinity
    for (const s of vis) {
      tMin = Math.min(tMin, s.pts[0].t); tMax = Math.max(tMax, s.pts[s.pts.length - 1].t)
      for (const p of s.pts) { if (p.valor < vMin) vMin = p.valor; if (p.valor > vMax) vMax = p.valor }
    }
    const vPad = (vMax - vMin) * 0.07 || vMax * 0.05 || 1
    vMin -= vPad; vMax += vPad
    const x = (t) => ((t - tMin) / (tMax - tMin || 1)) * (W - PAD_R)
    const y = (v) => PAD_T + (1 - (v - vMin) / (vMax - vMin || 1)) * (H - PAD_T - PAD_B)
    return { vis, tMin, tMax, vMin, vMax, x, y, largo: (tMax - tMin) > 200 * 86400_000 }
  }, [data, rango, off, series])

  if (data === null) return <div style={{ fontSize: 11, color: 'var(--muted)', padding: '12px 0' }}>Cargando histórico…</div>
  if (!view || view.vis.length === 0) return null
  const { vis, tMin, tMax, vMin, vMax, x, y, largo } = view

  // Grilla: 3 líneas horizontales + 4 ticks de fecha
  const gridY = [0.25, 0.5, 0.75].map(f => ({ yy: PAD_T + f * (H - PAD_T - PAD_B), val: vMax - f * (vMax - vMin) }))
  const ticksX = [0.02, 0.35, 0.68, 0.98].map(f => tMin + f * (tMax - tMin))

  // Crosshair: punto más cercano por serie
  const cur = cursor ? vis.map(s => {
    const i = nearestIdx(s.pts, cursor.t)
    return { ...s, p: s.pts[i] }
  }) : null
  const curX = cur?.length ? x(cur[0].p.t) : null
  const tipLeft = curX != null && curX > (W - PAD_R) * 0.55

  const handleMove = (e) => {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    const t = tMin + (Math.max(0, Math.min(px, W - PAD_R)) / (W - PAD_R)) * (tMax - tMin)
    setCursor({ t })
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {titulo && <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>{titulo}</span>}
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

      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          {series.map(s => {
            const pts = data[s.id] ?? []
            const last = pts.length ? pts[pts.length - 1].valor : null
            const offd = !!off[s.id]
            return (
              <button key={s.id} onClick={() => setOff(o => ({ ...o, [s.id]: !o[s.id] }))}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 10, color: offd ? 'var(--muted)' : s.color, opacity: offd ? .5 : 1 }}>
                ● {s.label}{last != null ? ` ${fmtVal(last, unidad)}` : ''}
              </button>
            )
          })}
        </div>
      )}

      <div ref={boxRef} style={{ position: 'relative', touchAction: 'pan-y' }}
        onPointerMove={handleMove} onPointerDown={handleMove} onPointerLeave={() => setCursor(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
          {gridY.map((g, i) => (
            <g key={i}>
              <line x1="0" y1={g.yy} x2={W - PAD_R} y2={g.yy} stroke="var(--border)" strokeWidth="0.6" />
              <text x={W - 2} y={g.yy + 3} textAnchor="end" fontSize="8" fill="var(--muted)">{fmtVal(g.val, unidad)}</text>
            </g>
          ))}

          {vis.length === 1 && (
            <path
              d={`${vis[0].pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ')} L${x(vis[0].pts[vis[0].pts.length - 1].t).toFixed(1)},${H - PAD_B} L${x(vis[0].pts[0].t).toFixed(1)},${H - PAD_B} Z`}
              fill={vis[0].color} opacity="0.07"
            />
          )}
          {vis.map(s => (
            <path key={s.id}
              d={s.pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ')}
              fill="none" stroke={s.color} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            />
          ))}

          {curX != null && (
            <g>
              <line x1={curX} y1={PAD_T - 4} x2={curX} y2={H - PAD_B + 4} stroke="var(--muted)" strokeWidth="0.8" strokeDasharray="3,3" />
              {cur.map(s => <circle key={s.id} cx={curX} cy={y(s.p.valor)} r="3" fill={s.color} />)}
            </g>
          )}

          {ticksX.map((t, i) => (
            <text key={i} x={((t - tMin) / (tMax - tMin || 1)) * (W - PAD_R)} y={H - 4}
              textAnchor={i === 0 ? 'start' : i === ticksX.length - 1 ? 'end' : 'middle'}
              fontSize="8" fill="var(--muted)">{fmtTickFecha(t, largo)}</text>
          ))}
        </svg>

        {cur?.length > 0 && (
          <div style={{
            position: 'absolute', top: 4,
            ...(tipLeft ? { left: 6 } : { right: `${(PAD_R / W) * 100 + 2}%` }),
            background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 6,
            padding: '5px 8px', pointerEvents: 'none', minWidth: 78,
          }}>
            <div style={{ fontSize: 9, color: 'var(--muted2)', marginBottom: 2 }}>{fmtFechaFull(cur[0].p.t)}</div>
            {cur.map(s => (
              <div key={s.id} style={{ fontSize: 10, color: s.color, fontFamily: 'var(--font-mono, monospace)' }}>
                {s.label} {fmtVal(s.p.valor, unidad)}{unidad === 'pb' ? ' pb' : ''}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
