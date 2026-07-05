// Fila compacta "Peso en cartera" para la grilla del bloque táctico: mini-barra
// horizontal con la zona de banda (mín→máx), tick del objetivo y punto del peso actual.
// Es UN dato más del detalle (no el protagonista): 2 renglones de alto.
const TEAL  = '#1d9e75'
const CORAL = '#d85a30'
const AMBER = '#e0a83a'

const fmt = (v) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 1 })

export default function BandaBar({ min, objetivo, max, actual }) {
  if (min == null || max == null || max <= 0) return null
  const a = actual ?? 0

  const sobre  = a > max
  const debajo = a < min
  const color  = sobre ? CORAL : debajo ? AMBER : TEAL
  const estado = sobre
    ? `sobre tu banda ${fmt(min)}–${fmt(max)}`
    : debajo
      ? `por debajo de tu banda ${fmt(min)}–${fmt(max)}`
      : `en tu banda ${fmt(min)}–${fmt(max)}`

  const scaleMax = Math.max(max, a) * 1.12 || 1
  const pos = (v) => `${Math.max(0, Math.min(100, (v / scaleMax) * 100))}%`

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Peso en cartera</span>
        <span style={{ fontSize: 10, color }}>{fmt(a)}% · {estado}</span>
      </div>
      <div style={{ position: 'relative', height: 10, marginTop: 5 }}>
        <div style={{ position: 'absolute', top: 4, left: 0, right: 0, height: 3, background: 'var(--surface2)', borderRadius: 2 }} />
        <div style={{ position: 'absolute', top: 4, left: pos(min), width: `${Math.max(0, ((max - min) / scaleMax) * 100)}%`, height: 3, background: 'rgba(29,158,117,.35)', borderRadius: 2 }} />
        {objetivo != null && (
          <div style={{ position: 'absolute', top: 1, left: pos(objetivo), width: 2, height: 9, background: '#5dcaa5', transform: 'translateX(-1px)' }} />
        )}
        <div style={{ position: 'absolute', top: 0.5, left: pos(a), transform: 'translateX(-50%)', width: 9, height: 9, borderRadius: '50%', background: color, border: '2px solid var(--surface)', boxSizing: 'border-box' }} />
      </div>
    </div>
  )
}
