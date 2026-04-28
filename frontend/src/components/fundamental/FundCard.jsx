import TacticalBadge from '../portfolio/TacticalBadge'

export default function FundCard({ position }) {
  const { ticker, descripcion, accion_tactica, sentimiento,
          ebitda_ttm, ev_ebitda, ev_ebitda_quality, mg_ebitda,
          ratios, tesis, escenarios } = position

  return (
    <div className={`fund-card ${sentimiento}`}>
      <div className="fc-top">
        <div>
          <div className="fc-ticker">{ticker}</div>
          <div className="fc-name">{descripcion}</div>
        </div>
        <TacticalBadge accion={accion_tactica} />
      </div>

      <div className="fc-ebitda-row">
        <div className="fc-ebitda-item">
          <div className="fc-ebitda-label">EBITDA TTM</div>
          <div className="fc-ebitda-val">{ebitda_ttm}</div>
        </div>
        <div className="fc-ebitda-item">
          <div className="fc-ebitda-label">EV/EBITDA</div>
          <div className={`fc-ebitda-val`}>{ev_ebitda}</div>
        </div>
        <div className="fc-ebitda-item">
          <div className="fc-ebitda-label">Mg. EBITDA</div>
          <div className="fc-ebitda-val">{mg_ebitda}</div>
        </div>
      </div>

      <div className="fc-ratios">
        {ratios.map(r => (
          <div className="fc-ratio" key={r.label}>
            <div className="fc-ratio-label">{r.label}</div>
            <div className={`fc-ratio-val ${r.quality}`}>{r.value}</div>
          </div>
        ))}
      </div>

      <div className="fc-tesis">{tesis}</div>

      <div className="fc-scenarios">
        <div className="fc-sce">
          <div className="fc-sce-label">Bear</div>
          <div className="fc-sce-val bear">{escenarios.bear}</div>
        </div>
        <div className="fc-sce">
          <div className="fc-sce-label">Base</div>
          <div className="fc-sce-val base">{escenarios.base}</div>
        </div>
        <div className="fc-sce">
          <div className="fc-sce-label">Bull</div>
          <div className="fc-sce-val bull">{escenarios.bull}</div>
        </div>
      </div>
    </div>
  )
}
