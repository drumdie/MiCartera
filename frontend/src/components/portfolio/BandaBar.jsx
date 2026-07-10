// Medidor VERTICAL de la banda objetivo (Contrato de Perfil) para el detalle de una
// posición. Máx arriba, Mín abajo, Obj como tick en el medio; el punto del peso actual
// se ubica proporcional entre Mín y Máx y, si se pasa, queda clavado en el borde.
const TEAL  = '#1d9e75'
const CORAL = '#d85a30'
const AMBER = '#e0a83a'

const H = 104
const TOP = 8
const INNER = H - TOP * 2

const fmt = (v) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 1 })

export default function BandaBar({ ticker, min, objetivo, max, actual }) {
  if (min == null || max == null || max <= min) return null
  const a = actual ?? 0
  const denom = max - min

  const sobre  = a > max
  const debajo = a < min
  const color  = sobre ? CORAL : debajo ? AMBER : TEAL
  const estado = sobre ? 'SOBRE BANDA' : debajo ? 'POR DEBAJO' : 'EN BANDA'

  const yOf = (v) => TOP + ((max - v) / denom) * INNER
  const yMax = TOP
  const yMin = TOP + INNER
  const yObj = objetivo != null ? yOf(objetivo) : null
  const fracA = Math.max(0, Math.min(1, (max - a) / denom))
  const yA = TOP + fracA * INNER

  const showObj = yObj != null && Math.abs(yObj - yMax) > 10 && Math.abs(yObj - yMin) > 10

  return (
    <div style={{
      flexShrink: 0, width: 116, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 8,
      paddingLeft: 8, borderLeft: '1px solid var(--border)',
    }}>
      <div style={{ textAlign: 'center', lineHeight: 1.35 }}>
        <div style={{ fontSize: 9, color: 'var(--muted)' }}>BANDA{ticker ? ` · ${ticker}` : ''}</div>
        <div style={{ fontSize: 9, color, letterSpacing: '.04em' }}>{estado}</div>
      </div>

      <div style={{ position: 'relative', height: H, width: 110 }}>
        <div style={{ position: 'absolute', left: 51, top: TOP, width: 6, height: INNER, background: 'rgba(96,116,140,.16)', border: '1px solid rgba(120,150,180,.28)', borderRadius: 3 }} />
        {yObj != null && (
          <div style={{ position: 'absolute', left: 46, top: yObj - 1, width: 16, height: 2, background: '#5dcaa5' }} />
        )}
        <div style={{ position: 'absolute', left: 48.5, top: yA - 5.5, width: 11, height: 11, borderRadius: '50%', background: color, border: '2px solid var(--surface2)', boxSizing: 'border-box' }} />

        <div style={{ position: 'absolute', right: 0, top: yMax, transform: 'translateY(-50%)', fontSize: 9, color: 'var(--muted)' }}>Máx {fmt(max)}%</div>
        {showObj && (
          <div style={{ position: 'absolute', right: 0, top: yObj, transform: 'translateY(-50%)', fontSize: 9, color: '#5dcaa5' }}>Obj {fmt(objetivo)}%</div>
        )}
        <div style={{ position: 'absolute', right: 0, top: yMin, transform: 'translateY(-50%)', fontSize: 9, color: 'var(--muted)' }}>Mín {fmt(min)}%</div>

        <div style={{ position: 'absolute', left: 0, top: yA, transform: 'translateY(-50%)', fontSize: 9, fontWeight: 500, color }}>{fmt(a)}%</div>
      </div>
    </div>
  )
}
