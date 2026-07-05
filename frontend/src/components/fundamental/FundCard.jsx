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

// Escenario: string "\$115 — desc" (contrato actual) u objeto v7 ({ precio, desc }).
// Separa precio (grande) de descripción (texto diferenciado).
function parseEscenario(val) {
  if (!val) return null
  if (typeof val !== 'string') return { precio: val.precio ?? null, desc: val.desc ?? null }
  for (const sep of [' — ', ' – ', ' - ']) {
    const i = val.indexOf(sep)
    if (i > 0) return { precio: val.slice(0, i).trim(), desc: val.slice(i + sep.length).trim() }
  }
  return { precio: val.trim(), desc: null }
}

// % implícito del escenario vs precio actual (de Yahoo). Solo si el precio del escenario
// es numérico, hay referencia, y el resultado es razonable (así filtra monedas mezcladas).
function upsideEscenario(precioStr, ref) {
  if (!precioStr || !ref || precioStr.includes('%')) return null
  const clean = String(precioStr).replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const nums = (clean.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(n => n > 0)
  if (!nums.length) return null
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length
  const pct = (avg / ref - 1) * 100
  return (Number.isFinite(pct) && Math.abs(pct) <= 300) ? pct : null
}

const ESC_META = [
  ['bear', 'Pesimista', 'var(--red)'],
  ['base', 'Base',      'var(--warn)'],
  ['bull', 'Optimista', 'var(--buy)'],
]

// KPIs del análisis IA que duplican los recuadros fijos / ratios de Yahoo → no repetir.
const KPI_DUP = new Set([
  'ebitda_ttm', 'ev_ebitda', 'mg_ebitda', 'margen_ebitda', 'pe', 'p_e',
  'pe_trailing', 'pe_fwd', 'roe', 'mg_bruto', 'margen_bruto', 'crec_ingresos', 'deuda_ebitda',
])

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
  // UNA sola fila de chips: ratios de Yahoo + extras del análisis IA (sin duplicados, máx 4)
  const kpisIA = kpis
    ? Object.entries(kpis).filter(([k, v]) => v != null && v !== '' && !KPI_DUP.has(k)).slice(0, 4)
    : []

  const tieneEscenarios = !!(escenarios && (escenarios.bear || escenarios.base || escenarios.bull))

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

      {/* KPIs homogéneos: 3 recuadros fijos; el comparable vive DENTRO de Valuación */}
      {kpiEntries.length > 0 && (
        <div className="fc-kpis">
          {kpiEntries.map(([key, value]) => {
            const [label, sub] = kpiMeta(key)
            return (
              <div className="fc-kpi-item" key={key}>
                <div className="fc-kpi-label">{label}</div>
                {sub && <div className="fc-kpi-sub">{sub}</div>}
                <div className="fc-kpi-val">{value}</div>
                {key === 'ev_ebitda' && comparable_ev_ebitda && (
                  <div style={{ fontSize: 8, color: 'var(--warn)', marginTop: 2 }}>
                    vs {comparable_ev_ebitda.nombre}: {comparable_ev_ebitda.valor}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* UNA fila de chips: ratios Yahoo + extras del análisis IA (deduplicados) */}
      {(ratios.length > 0 || kpisIA.length > 0) && (
        <div className="fc-ratios" style={{ marginBottom: 10 }}>
          {ratios.map(r => (
            <div className="fc-ratio" key={r.label}>
              <div className="fc-ratio-label">{r.label}</div>
              <div className={`fc-ratio-val ${r.quality ?? ''}`}>{r.value}</div>
            </div>
          ))}
          {kpisIA.map(([key, value]) => (
            <div className="fc-ratio" key={key}>
              <div className="fc-ratio-label">{String(key).replace(/_/g, ' ')}</div>
              <div className="fc-ratio-val">{value}</div>
            </div>
          ))}
        </div>
      )}

      {tesis && <div className="fc-tesis" style={{ margin: '2px 0 10px' }}>{tesis}</div>}

      {/* Escenarios de precio — filas con precio grande, % implícito y descripción */}
      {tieneEscenarios && (
        <div style={{ marginBottom: 10 }}>
          <div className="fc-sce-cap">Escenarios de precio · estimación IA</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {ESC_META.map(([k, label, color]) => {
              const e = parseEscenario(escenarios[k])
              if (!e?.precio) return null
              const up = upsideEscenario(e.precio, an?.precio_ref)
              return (
                <div key={k} style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${color}`, borderRadius: '0 8px 8px 0', padding: '8px 11px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color, textTransform: 'uppercase', letterSpacing: '.06em', minWidth: 58 }}>{label}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{e.precio}</span>
                    {up != null && (
                      <span style={{ fontSize: 10, color: up >= 0 ? 'var(--buy)' : 'var(--red)' }}>
                        {up >= 0 ? '+' : ''}{up.toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {e.desc && <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.5, marginTop: 3 }}>{e.desc}</div>}
                </div>
              )
            })}
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
