import { FUND_SORT_OPTS } from '../../utils/fundamentalOrder'

// Control compacto de orden para el tab Fundamental: un solo chip atenuado con ícono de
// orden + la etiqueta del modo actual. Al tocarlo cicla Posiciones → Tipo → % cartera.
export default function FundSortControl({ value, onChange }) {
  const idx = Math.max(0, FUND_SORT_OPTS.findIndex(o => o.id === value))
  const cur = FUND_SORT_OPTS[idx]
  const next = () => onChange(FUND_SORT_OPTS[(idx + 1) % FUND_SORT_OPTS.length].id)

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0 2px' }}>
      <button
        type="button"
        onClick={next}
        title="Cambiar orden"
        aria-label={`Orden: ${cur.label}. Tocar para cambiar`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, color: 'var(--muted2)',
          background: 'transparent', border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)', padding: '4px 9px', cursor: 'pointer',
        }}
      >
        <i className="ti ti-arrows-sort" aria-hidden="true" />
        <span>{cur.label}</span>
      </button>
    </div>
  )
}
