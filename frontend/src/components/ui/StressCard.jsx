export default function StressCard({ scenario }) {
  const {
    nombre, descripcion, supuesto,
    impacto_cartera_pct, tipo,
    tickers_mas_afectados = [],
    amortiguadores = [],
  } = scenario

  const sign = impacto_cartera_pct >= 0 ? '+' : ''

  return (
    <div className={`stress-card ${tipo}`}>
      <h4>{nombre}</h4>
      <div className="stress-drop">{sign}{impacto_cartera_pct.toFixed(1).replace('.', ',')}%</div>

      {supuesto && (
        <div className="stress-supuesto">{supuesto}</div>
      )}

      <div className="stress-desc">{descripcion}</div>

      {tickers_mas_afectados.length > 0 && (
        <div className="stress-meta">
          <span className="stress-meta-label">⚠ Expuestos</span>
          <span className="stress-meta-val">{tickers_mas_afectados.join(' · ')}</span>
        </div>
      )}

      {amortiguadores.length > 0 && (
        <div className="stress-meta">
          <span className="stress-meta-label">🛡 Cobertura</span>
          <span className="stress-meta-val">{amortiguadores.join(' · ')}</span>
        </div>
      )}
    </div>
  )
}
