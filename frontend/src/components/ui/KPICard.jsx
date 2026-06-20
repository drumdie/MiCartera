// KPI. Si recibe `onClick` se vuelve tappable (drill-down) con chevron y feedback al tocar.
// `primary` lo resalta en verde (lo usa "Mayor posición", el drill-down estrella).
export default function KPICard({ label, value, sub, className = '', onClick, primary = false }) {
  const tappable = typeof onClick === 'function'
  const cls = `kpi ${tappable ? 'kpi-tappable' : ''} ${primary ? 'kpi-primary' : ''}`.trim()

  const inner = (
    <>
      {tappable && <i className="ti ti-chevron-right kpi-chev" aria-hidden="true" />}
      <div className="kpi-label">{label}</div>
      <div className={`kpi-val ${className}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </>
  )

  if (tappable) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-label={`${label}, ver detalle`}>
        {inner}
      </button>
    )
  }
  return <div className={cls}>{inner}</div>
}
