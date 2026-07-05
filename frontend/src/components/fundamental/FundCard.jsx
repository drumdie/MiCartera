import { useState } from 'react'
import TradingViewWidget from '../charts/TradingViewWidget'

// Acepta tanto los valores de Claude (positivo/negativo) como los alias cortos (bull/bear)
const SENT_CLASS = {
  positivo: 'bull', bull: 'bull',
  negativo: 'bear', bear: 'bear',
  neutral:  'neutral',
}
const SENT_LABEL = { bull: 'Visión: positiva', bear: 'Visión: negativa', neutral: 'Visión: neutral' }

// recommendationKey de Yahoo → castellano
const RECO_LABEL = {
  strong_buy: 'Compra fuerte', buy: 'Comprar', hold: 'Mantener',
  underperform: 'Debajo del mercado', sell: 'Vender', strong_sell: 'Venta fuerte',
}
const RECO_POS = new Set(['strong_buy', 'buy'])
const RECO_NEG = new Set(['sell', 'strong_sell', 'underperform'])

// KPIs: doble etiqueta — nombre simple (grande) + sigla técnica (chica).
// Los keys desconocidos caen al nombre crudo sin sub-etiqueta.
const KPI_META = {
  ebitda_ttm:    ['Ganancia operativa', 'EBITDA últ. 12m'],
  ev_ebitda:     ['Valuación', 'EV/EBITDA · menor = más barata'],
  margen_ebitda: ['Margen', 'EBITDA / ventas'],
  mg_ebitda:     ['Margen', 'EBITDA / ventas'],
}
const kpiMeta = (key) => KPI_META[key] ?? [String(key).replace(/_/g, ' '), null]

// Escenario puede ser string directo ("$55–70") u objeto v7 ({ precio, prob, desc })
function scenarioPrice(val) {
  if (!val) return null
  if (typeof val === 'string') return val
  return val.precio ?? null
}

const monedaPrefix = (m) => m === 'ARS' ? 'AR$' : m === 'USD' ? 'US$' : (m ? `${m} ` : '$')
const fmtNum = (v) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 })

export default function FundCard({ position }) {
  const [showTV, setShowTV]   = useState(false)
  const [showExt, setShowExt] = useState(false)

  const {
    ticker, descripcion, sentimiento, sector,
    // KPIs legacy (yfinance directo)
    ebitda_ttm, ev_ebitda, mg_ebitda,
    // KPIs v7 (objeto dinámico de Claude)
    kpis,
    // Q1 highlight (Claude)
    q1_2026, q1_fuente,
    // Comparable peer (Claude)
    comparable_ev_ebitda,
    // Consenso de analistas (dato duro de Yahoo, vía "Actualizar fundamentales")
    analistas,
    // Ratios array (legacy)
    ratios = [],
    // Tesis y escenarios
    tesis, escenarios = {},
    // Ampliación (Claude): análisis largo + links a fuentes
    analisis_extendido, fuentes = [],
    // TradingView
    tv_symbol,
    // Fecha del análisis de Claude (cuándo se hizo)
    ultima_analisis,
  } = position

  const sentClass = SENT_CLASS[sentimiento] ?? 'neutral'

  // KPIs HOMOGÉNEOS: siempre los mismos 3 recuadros (dato duro de yfinance, igual en
  // todas las cards). Los KPIs variables del análisis IA van aparte, como chips.
  const kpiEntries = [
    ['ebitda_ttm', ebitda_ttm],
    ['ev_ebitda',  ev_ebitda],
    ['mg_ebitda',  mg_ebitda],
  ].filter(([, v]) => v != null && v !== '')
  const kpisIA = kpis ? Object.entries(kpis).filter(([, v]) => v != null && v !== '') : []

  const bearVal = scenarioPrice(escenarios.bear)
  const baseVal = scenarioPrice(escenarios.base)
  const bullVal = scenarioPrice(escenarios.bull)

  // Bloque de analistas: solo si hay target (no todos los papeles tienen cobertura)
  const an = analistas && analistas.target_medio ? analistas : null
  const anPref = an ? monedaPrefix(an.moneda) : ''
  const upPos = an?.upside_pct != null && an.upside_pct >= 0
  const recoKey = an?.recomendacion
  // 'none' de Yahoo = sin recomendación → no mostrar la línea
  const recoTxt = recoKey && recoKey !== 'none' ? (RECO_LABEL[recoKey] ?? recoKey) : null
  const recoClr = RECO_POS.has(recoKey) ? 'var(--buy)' : RECO_NEG.has(recoKey) ? 'var(--red)' : 'var(--warn)'
  // Rango solo si aporta (alto ≠ bajo; con 1 analista suelen ser iguales)
  const showRango = an?.target_bajo != null && an?.target_alto != null && an.target_bajo !== an.target_alto
  const anCap = an
    ? (an.cantidad === 1 ? 'Precio objetivo · estimación de 1 analista'
       : an.cantidad ? `Precio objetivo · consenso de ${an.cantidad} analistas`
       : 'Precio objetivo · consenso de analistas')
    : ''

  const metaLine = [sector, ultima_analisis ? `Análisis del ${new Date(ultima_analisis).toLocaleDateString('es-AR')}` : null]
    .filter(Boolean).join(' · ')

  return (
    <div className={`fund-card ${sentClass}`}>

      {/* Header: ticker + chip de visión */}
      <div className="fc-top">
        <div>
          <div className="fc-ticker">{ticker}</div>
          <div className="fc-name">{descripcion}</div>
          {metaLine && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{metaLine}</div>}
        </div>
        <span className={`fc-visn ${sentClass}`}>{SENT_LABEL[sentClass]}</span>
      </div>

      {/* Precio objetivo · consenso de analistas (dato duro, NO estimación IA) */}
      {an && (
        <div className="fc-target">
          <div className="fc-target-cap">
            <i className="ti ti-target-arrow" aria-hidden="true" />
            {anCap}
          </div>
          <div className="fc-target-main">
            <span className="fc-target-val">{anPref} {fmtNum(an.target_medio)}</span>
            {an.upside_pct != null && (
              <span className="fc-target-up" style={{ color: upPos ? 'var(--buy)' : 'var(--red)' }}>
                {upPos ? '+' : ''}{fmtNum(an.upside_pct)}%
              </span>
            )}
            {an.precio_ref != null && (
              <span className="fc-target-ref">vs actual {anPref} {fmtNum(an.precio_ref)}</span>
            )}
          </div>
          {(showRango || recoTxt) && (
            <div className="fc-target-foot">
              {showRango && <span>Rango: {anPref} {fmtNum(an.target_bajo)} – {fmtNum(an.target_alto)}</span>}
              {recoTxt && <span>Recomendación: <b style={{ color: recoClr, fontWeight: 600 }}>{recoTxt}</b></span>}
            </div>
          )}
        </div>
      )}

      {/* Q1 highlight chip */}
      {q1_2026 && (
        <div className="fc-q1">
          <span className="fc-q1-icon">✅</span>
          <span className="fc-q1-text">{q1_2026}</span>
          {q1_fuente && <span className="fc-q1-fuente"> · {q1_fuente}</span>}
        </div>
      )}

      {/* KPIs con doble etiqueta (nombre simple + sigla técnica) */}
      {kpiEntries.length > 0 && (
        <div className="fc-kpis">
          {kpiEntries.map(([key, value]) => {
            const [label, sub] = kpiMeta(key)
            return (
              <div className="fc-kpi-item" key={key}>
                <div className="fc-kpi-label">{label}</div>
                {sub && <div className="fc-kpi-sub">{sub}</div>}
                <div className="fc-kpi-val">{value}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* KPIs variables del análisis IA (distintos por empresa) → chips secundarios */}
      {kpisIA.length > 0 && (
        <div className="fc-ratios" style={{ marginTop: 2 }}>
          {kpisIA.map(([key, value]) => (
            <div className="fc-ratio" key={key}>
              <div className="fc-ratio-label">{String(key).replace(/_/g, ' ')}</div>
              <div className="fc-ratio-val">{value}</div>
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

      {/* Escenarios de precio — estimación IA (distinto del target de analistas) */}
      {(bearVal || baseVal || bullVal) && (
        <div>
          <div className="fc-sce-cap">Escenarios de precio · estimación IA</div>
          <div className="fc-scenarios">
            {bearVal && (
              <div className="fc-sce">
                <div className="fc-sce-label" style={{ color: 'var(--red)' }}>Pesimista</div>
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
                <div className="fc-sce-label" style={{ color: 'var(--buy)' }}>Optimista</div>
                <div className="fc-sce-val bull">{bullVal}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Análisis extendido (expandible) */}
      {analisis_extendido && (
        <button className="fc-tv-btn" onClick={() => setShowExt(v => !v)}>
          <span>{showExt ? '▲' : '📄'}</span>
          <span>{showExt ? 'Ocultar análisis' : 'Análisis completo'}</span>
        </button>
      )}
      {showExt && analisis_extendido && (
        <div className="fc-ext">{analisis_extendido}</div>
      )}

      {/* Fuentes para ampliar */}
      {fuentes.length > 0 && (
        <div className="fc-fuentes">
          <span className="fc-fuentes-icon">📎</span>
          {fuentes.map(f => (
            <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer">
              {f.nombre}
            </a>
          ))}
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
