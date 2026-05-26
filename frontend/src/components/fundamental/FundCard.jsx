import { useState } from 'react'
import TacticalBadge from '../portfolio/TacticalBadge'
import TradingViewWidget from '../charts/TradingViewWidget'

// Acepta tanto los valores de Claude (positivo/negativo) como los alias cortos (bull/bear)
const SENT_CLASS = {
  positivo: 'bull', bull: 'bull',
  negativo: 'bear', bear: 'bear',
  neutral:  'neutral',
}

export default function FundCard({ position }) {
  const [showTV, setShowTV] = useState(false)

  const { ticker, descripcion, accion_tactica, sentimiento,
          ebitda_ttm, ev_ebitda, ev_ebitda_quality, mg_ebitda,
          ratios = [], tesis, escenarios = {}, tv_symbol } = position

  const sentClass = SENT_CLASS[sentimiento] ?? 'neutral'

  return (
    <div className={`fund-card ${sentClass}`}>
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
          <div className="fc-ebitda-val">{ebitda_ttm ?? '—'}</div>
        </div>
        <div className="fc-ebitda-item">
          <div className="fc-ebitda-label">EV/EBITDA</div>
          <div className="fc-ebitda-val">{ev_ebitda ?? '—'}</div>
        </div>
        <div className="fc-ebitda-item">
          <div className="fc-ebitda-label">Mg. EBITDA</div>
          <div className="fc-ebitda-val">{mg_ebitda ?? '—'}</div>
        </div>
      </div>

      {ratios.length > 0 && (
        <div className="fc-ratios">
          {ratios.map(r => (
            <div className="fc-ratio" key={r.label}>
              <div className="fc-ratio-label">{r.label}</div>
              <div className={`fc-ratio-val ${r.quality ?? ''}`}>{r.value}</div>
            </div>
          ))}
        </div>
      )}

      {tesis && <div className="fc-tesis">{tesis}</div>}

      {(escenarios.bear || escenarios.base || escenarios.bull) && (
        <div className="fc-scenarios">
          {escenarios.bear && (
            <div className="fc-sce">
              <div className="fc-sce-label">Bear</div>
              <div className="fc-sce-val bear">{escenarios.bear}</div>
            </div>
          )}
          {escenarios.base && (
            <div className="fc-sce">
              <div className="fc-sce-label">Base</div>
              <div className="fc-sce-val base">{escenarios.base}</div>
            </div>
          )}
          {escenarios.bull && (
            <div className="fc-sce">
              <div className="fc-sce-label">Bull</div>
              <div className="fc-sce-val bull">{escenarios.bull}</div>
            </div>
          )}
        </div>
      )}

      {/* Botón TradingView */}
      {tv_symbol && (
        <button
          className="fc-tv-btn"
          onClick={() => setShowTV(v => !v)}
        >
          <span>{showTV ? '▲' : '📈'}</span>
          <span>{showTV ? 'Ocultar gráfico' : `Gráfico y financieros · ${tv_symbol}`}</span>
        </button>
      )}

      {showTV && tv_symbol && (
        <div className="fc-tv-wrap">
          <TradingViewWidget symbol={tv_symbol} />
        </div>
      )}
    </div>
  )
}
