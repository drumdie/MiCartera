import { useState } from 'react'
import TacticalBadge from '../portfolio/TacticalBadge'
import TradingViewWidget from '../charts/TradingViewWidget'

// Acepta tanto los valores de Claude (positivo/negativo) como los alias cortos (bull/bear)
const SENT_CLASS = {
  positivo: 'bull', bull: 'bull',
  negativo: 'bear', bear: 'bear',
  neutral:  'neutral',
}

// Escenario puede ser string directo ("$55–70") u objeto v7 ({ precio, prob, desc })
function scenarioPrice(val) {
  if (!val) return null
  if (typeof val === 'string') return val
  return val.precio ?? null
}

export default function FundCard({ position }) {
  const [showTV, setShowTV] = useState(false)

  const {
    ticker, descripcion, accion_tactica, sentimiento,
    // KPIs legacy (yfinance directo)
    ebitda_ttm, ev_ebitda, ev_ebitda_quality, mg_ebitda,
    // KPIs v7 (objeto dinámico de Claude)
    kpis,
    // Q1 highlight (Claude)
    q1_2026, q1_fuente,
    // Comparable peer (Claude)
    comparable_ev_ebitda,
    // Ratios array (legacy)
    ratios = [],
    // Tesis y escenarios
    tesis, escenarios = {},
    // TradingView
    tv_symbol,
  } = position

  const sentClass = SENT_CLASS[sentimiento] ?? 'neutral'

  // Si existe el objeto `kpis` (v7 / Claude) → usarlo dinámicamente
  // Si no → caer a los 3 fijos de yfinance
  const kpiEntries = kpis
    ? Object.entries(kpis).filter(([, v]) => v != null && v !== '')
    : [
        ['EBITDA TTM', ebitda_ttm],
        ['EV/EBITDA',  ev_ebitda],
        ['Mg. EBITDA', mg_ebitda],
      ].filter(([, v]) => v != null)

  const bearVal = scenarioPrice(escenarios.bear)
  const baseVal = scenarioPrice(escenarios.base)
  const bullVal = scenarioPrice(escenarios.bull)

  return (
    <div className={`fund-card ${sentClass}`}>

      {/* Header: ticker + badge */}
      <div className="fc-top">
        <div>
          <div className="fc-ticker">{ticker}</div>
          <div className="fc-name">{descripcion}</div>
        </div>
        <TacticalBadge accion={accion_tactica} />
      </div>

      {/* Q1 highlight chip */}
      {q1_2026 && (
        <div className="fc-q1">
          <span className="fc-q1-icon">✅</span>
          <span className="fc-q1-text">{q1_2026}</span>
          {q1_fuente && <span className="fc-q1-fuente"> · {q1_fuente}</span>}
        </div>
      )}

      {/* KPIs dinámicos o fixed fallback */}
      {kpiEntries.length > 0 && (
        <div className="fc-kpis">
          {kpiEntries.map(([label, value]) => (
            <div className="fc-kpi-item" key={label}>
              <div className="fc-kpi-label">{String(label).replace(/_/g, ' ')}</div>
              <div className="fc-kpi-val">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Comparable peer */}
      {comparable_ev_ebitda && (
        <div className="fc-comparable">
          vs {comparable_ev_ebitda.nombre}:{' '}
          <span className="fc-comparable-val">{comparable_ev_ebitda.valor}</span>
        </div>
      )}

      {/* Ratios array (legacy / Claude analysis) */}
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

      {(bearVal || baseVal || bullVal) && (
        <div className="fc-scenarios">
          {bearVal && (
            <div className="fc-sce">
              <div className="fc-sce-label">Bear</div>
              <div className="fc-sce-val bear">{bearVal}</div>
            </div>
          )}
          {baseVal && (
            <div className="fc-sce">
              <div className="fc-sce-label">Base</div>
              <div className="fc-sce-val base">{baseVal}</div>
            </div>
          )}
          {bullVal && (
            <div className="fc-sce">
              <div className="fc-sce-label">Bull</div>
              <div className="fc-sce-val bull">{bullVal}</div>
            </div>
          )}
        </div>
      )}

      {/* Botón TradingView */}
      {tv_symbol && (
        <button className="fc-tv-btn" onClick={() => setShowTV(v => !v)}>
          <span>{showTV ? '▲' : '📈'}</span>
          <span>{showTV ? 'Ocultar gráfico' : `Gráfico · ${tv_symbol}`}</span>
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
