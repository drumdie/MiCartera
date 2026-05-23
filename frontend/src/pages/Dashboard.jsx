import { useState, useEffect } from 'react'
import { useApp } from '../store/AppContext'
import { usePrivacy } from '../hooks/usePrivacy'
import { formatARS, formatUSD } from '../utils/formatters'
import { TICKERS_TV } from '../data/mockPortfolio'

import Header          from '../components/layout/Header'
import CurrencyToggle  from '../components/layout/CurrencyToggle'
import DemoBanner      from '../components/ui/DemoBanner'
import KPICard         from '../components/ui/KPICard'
import Modal           from '../components/ui/Modal'
import Toast           from '../components/ui/Toast'
import PrivacyMask     from '../components/ui/PrivacyMask'
import StressCard      from '../components/ui/StressCard'
import DonutChart      from '../components/charts/DonutChart'
import TradingViewWidget from '../components/charts/TradingViewWidget'
import CategorySection from '../components/portfolio/CategorySection'
import LiquidezBlock   from '../components/portfolio/LiquidezBlock'
import FundCard        from '../components/fundamental/FundCard'
import CatalystItem    from '../components/catalysts/CatalystItem'
import CopyContextBtn  from '../components/claude-tools/CopyContextBtn'
import PasteResultArea from '../components/claude-tools/PasteResultArea'

const TABS = [
  { id: 'posiciones',    label: 'Posiciones'   },
  { id: 'fundamental',   label: 'Fundamental'  },
  { id: 'catalizadores', label: 'Catalizadores'},
  { id: 'graficos',      label: 'Gráficos'     },
]

const CAT_META = {
  acciones_ar: { name: 'Acciones AR', color: '#00e5a0' },
  cedears:     { name: 'CEDEARs',     color: '#4a9eff' },
  liquidez:    { name: 'Liquidez',    color: '#f7b731' },
  ons:         { name: 'ONs',         color: '#c084fc' },
  fci:         { name: 'FCI',         color: '#fb923c' },
  bonos:       { name: 'Bonos',       color: '#f472b6' },
}

export default function Dashboard() {
  const { activeCurrency, distMode, setDistMode,
          cotizaciones, resumen, portfolio,
          catalizadores, stressTest, fundamental,
          lastSync } = useApp()
  const { privacyOn, toggle: togglePrivacy } = usePrivacy()

  const [activeTab,      setActiveTab]      = useState('posiciones')
  const [selectedTicker, setSelectedTicker] = useState(null)
  const [modalOpen,      setModalOpen]      = useState(false)
  const [toastMsg,       setToastMsg]       = useState('')

  const showToast = (msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  // Mostrar toast cuando se completa una sincronización con PPI
  useEffect(() => {
    if (lastSync) showToast('✓ Cartera sincronizada con PPI')
  }, [lastSync])

  const switchTab = (id) => {
    setActiveTab(id)
    window.scrollTo(0, 0)
  }

  // ── Distribución para DonutChart (desde datos reales del resumen) ────────
  const distInstrumento = Object.entries(resumen?.composicion_pct ?? {})
    .filter(([, pct]) => pct > 0.1)
    .map(([cat, pct]) => ({
      name:  CAT_META[cat]?.name  ?? cat,
      color: CAT_META[cat]?.color ?? '#888',
      pct:   parseFloat(pct.toFixed(1)),
    }))

  // Aproximación moneda: CEDEARs + ONs → dolarizados; resto → ARS
  const pctUSD = (resumen?.composicion_pct?.cedears ?? 0) + (resumen?.composicion_pct?.ons ?? 0)
  const pctARS = Math.max(0, parseFloat((100 - pctUSD).toFixed(1)))
  const distMoneda = [
    { name: 'Pesos ARS',      pct: pctARS,                         color: '#4a9eff' },
    { name: 'Dólares (aprox)', pct: parseFloat(pctUSD.toFixed(1)), color: '#00e5a0' },
  ]

  // ── Total valorizado según moneda activa ──────────────────────────────────
  const totalARS  = resumen?.valor_total_ars ?? 0
  const totalDisp = (() => {
    switch (activeCurrency) {
      case 'ARS': return formatARS(totalARS)
      case 'MEP': return formatUSD(totalARS / cotizaciones.dolar_mep)
      case 'CCL': return formatUSD(totalARS / cotizaciones.dolar_ccl)
      case 'BNA': return formatARS(totalARS)
      default:    return formatARS(totalARS)
    }
  })()
  const totalSub = (() => {
    switch (activeCurrency) {
      case 'MEP': return `Cotización Dólar MEP: ${formatARS(cotizaciones.dolar_mep)}`
      case 'CCL': return `Cotización Dólar CCL: ${formatARS(cotizaciones.dolar_ccl)}`
      case 'BNA': return 'Ref. tipo de cambio BNA'
      default: return ''
    }
  })()
  const rendPct = (activeCurrency === 'ARS' || activeCurrency === 'BNA')
    ? (resumen?.rend_total_ars_pct     ?? null)
    : (resumen?.rend_total_usd_mep_pct ?? null)
  const rendPos = (rendPct ?? 0) >= 0

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const liqPct = portfolio?.liquidez?.pct_cartera    ?? 0
  const liqUSD = portfolio?.liquidez?.usd_total_aprox ?? 0
  const liqARS = portfolio?.liquidez?.subtotal_ars    ?? 0
  const totalTickers =
    (portfolio?.acciones_ar?.posiciones?.length ?? 0) +
    (portfolio?.cedears?.posiciones?.length     ?? 0) +
    (portfolio?.bonos?.posiciones?.length       ?? 0) +
    (portfolio?.ons?.posiciones?.length         ?? 0) +
    (portfolio?.fci?.posiciones?.length         ?? 0)

  return (
    <div className="app">
      <Header onSyncDone={showToast} />
      <DemoBanner />

      {/* ── HERO ── */}
      <div className="hero-block fade-in d1">

        {/* Total valorizado */}
        <div className="total-card">
          <div className="total-top">
            <div className="total-top-left">
              <span className="total-label">Total valorizado</span>
              <button className="eye-btn" onClick={togglePrivacy} title={privacyOn ? 'Mostrar montos' : 'Ocultar montos'}>
                {privacyOn ? '🙈' : '👁'}
              </button>
            </div>
            <CurrencyToggle />
          </div>
          <div className="total-amount"><PrivacyMask>{totalDisp}</PrivacyMask></div>
          <div className="total-sub">{totalSub}</div>
          <div className="total-rend">
            <span className="rend-label">Rend. desde compra</span>
            <span className={`rend-val${rendPos ? '' : ' neg'}`}>
              {rendPct != null
                ? <>{rendPos ? '▲' : '▼'} {rendPos ? '+' : ''}{rendPct.toFixed(2).replace('.', ',')}%</>
                : <span style={{ color: 'var(--text-muted, #888)', fontSize: '0.85em' }}>N/D</span>
              }
            </span>
          </div>
        </div>

        {/* Distribución */}
        <div className="dist-card">
          <div className="dist-top">
            <span className="dist-label">Distribución</span>
            <div className="dist-toggle">
              <button className={`dist-btn ${distMode === 'instrumento' ? 'active' : ''}`} onClick={() => setDistMode('instrumento')}>Instrumento</button>
              <button className={`dist-btn ${distMode === 'moneda' ? 'active' : ''}`} onClick={() => setDistMode('moneda')}>Moneda</button>
            </div>
          </div>
          <DonutChart data={distMode === 'instrumento' ? distInstrumento : distMoneda} />
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="kpis-mini fade-in d2">
        <KPICard
          label="Liquidez"
          value={`${liqPct.toFixed(2).replace('.', ',')}%`}
          sub={<PrivacyMask>≈ USD {liqUSD.toLocaleString('es-AR')} · ARS {Math.round(liqARS / 1000)}K</PrivacyMask>}
          className="warn"
        />
        <KPICard
          label="Posiciones"
          value={String(totalTickers + portfolio.liquidez.detalle.length)}
          sub={`5 categorías · ${totalTickers} tickers`}
        />
      </div>

      {/* ── TABS ── */}
      <div className="tabs-bar fade-in d2">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: POSICIONES ── */}
      <div className={`tab-content ${activeTab === 'posiciones' ? 'active' : ''}`}>
        <CategorySection title="Acciones AR"  category={portfolio.acciones_ar} />
        <CategorySection title="CEDEARs"      category={portfolio.cedears}     isCedear />
        <CategorySection title="Bonos"        category={portfolio.bonos}       isBono />
        <CategorySection title="ONs"          category={portfolio.ons}         isON />
        <CategorySection title="FCI"          category={portfolio.fci}         isFCI />

        <div className="sec-title fade-in">Stress test</div>
        <div className="stress-row">
          {stressTest.map(s => <StressCard key={s.nombre} scenario={s} />)}
        </div>

        <LiquidezBlock liquidez={portfolio.liquidez} />

        <div className="sec-title fade-in">Herramientas Claude</div>
        <div className="action-btns fade-in">
          <CopyContextBtn tipo="tactico"     onToast={showToast} />
          <PasteResultArea id="paste-tac" label="Pegar resultado táctico" sub="Cargá el JSON de respuesta de Claude" onLoad={() => showToast('✓ Resultado cargado')} />
        </div>
      </div>

      {/* ── TAB: FUNDAMENTAL ── */}
      <div className={`tab-content ${activeTab === 'fundamental' ? 'active' : ''}`}>
        {fundamental.map(sector => (
          <div key={sector.sector}>
            <div className="sec-title" style={{ marginTop: 8 }}>{sector.sector}</div>
            <div className="fund-grid">
              {sector.posiciones.map(pos => <FundCard key={pos.ticker} position={pos} />)}
            </div>
          </div>
        ))}
        <div className="sec-title" style={{ marginTop: 20 }}>Herramientas Claude</div>
        <div className="action-btns">
          <CopyContextBtn tipo="fundamental" onToast={showToast} />
          <PasteResultArea id="paste-fund" label="Pegar resultado fundamental" sub="Cargá el JSON de Claude" onLoad={() => showToast('✓ Análisis cargado')} />
          <button className="action-btn deep-btn" onClick={() => setModalOpen(true)}>
            <span className="ab-icon">📖</span>
            <div className="ab-text">
              <div className="ab-title">Ver análisis profundo</div>
              <div className="ab-sub">Análisis completo — todos los tickers</div>
            </div>
            <span className="ab-arrow">→</span>
          </button>
        </div>
      </div>

      {/* ── TAB: CATALIZADORES ── */}
      <div className={`tab-content ${activeTab === 'catalizadores' ? 'active' : ''}`}>
        <div className="sec-title" style={{ marginTop: 8 }}>Próximos eventos</div>
        <div className="timeline">
          {catalizadores.map((cat, i) => <CatalystItem key={i} catalyst={cat} />)}
        </div>
      </div>

      {/* ── TAB: GRÁFICOS ── */}
      <div className={`tab-content ${activeTab === 'graficos' ? 'active' : ''}`}>
        <div className="sec-title" style={{ marginTop: 8 }}>Seleccioná un ticker</div>
        <div className="chart-selector">
          {Object.keys(TICKERS_TV).map(ticker => (
            <button
              key={ticker}
              className={`chart-ticker-btn ${selectedTicker === ticker ? 'active' : ''}`}
              onClick={() => setSelectedTicker(ticker)}
            >
              {ticker}
            </button>
          ))}
        </div>
        <div id="chart-content">
          <TradingViewWidget symbol={selectedTicker ? TICKERS_TV[selectedTicker] : null} />
        </div>
      </div>

      <footer>Demo v5b · Datos de ejemplo — no reales · No constituye asesoramiento financiero</footer>

      {/* ── MODAL ANÁLISIS PROFUNDO ── */}
      <Modal
        id="modal-profundo"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Análisis Fundamental — Demo"
        subtitle="Datos de ejemplo · Estructura para integración con API real"
      >
        <div className="ab-heading">Empresa A (TKRA) — Tesis estructural</div>
        <div className="ab-content">
          Posición dominante con descuento masivo vs pares regionales. EBITDA TTM USD 4,5B,
          EV/EBITDA 4,2x vs par comparable 6,5x. Catalizador regulatorio pendiente.
          Tesis bull: normalización a 5,5x EV/EBITDA implica precio objetivo ~$75–90.
        </div>
        <div className="ab-heading">Síntesis CEDEARs</div>
        <div className="ab-content">
          <table>
            <thead>
              <tr><th>Ticker</th><th>EV/EBITDA</th><th>Mg. EBITDA</th><th>Rend. USD</th><th>Acción</th></tr>
            </thead>
            <tbody>
              <tr><td>CEDR1</td><td className="td-warn">N/A</td><td className="td-pos">Alta vol.</td><td className="td-pos">+120%</td><td className="td-warn">Parcial</td></tr>
              <tr><td>CEDR2</td><td className="td-neg">42x</td><td className="td-pos">60%</td><td className="td-pos">+40%</td><td className="td-warn">Tomar</td></tr>
              <tr><td>CEDR3</td><td>—</td><td>—</td><td className="td-pos">+25%</td><td>Core · Mantener</td></tr>
            </tbody>
          </table>
        </div>
        <div className="ab-heading">Conclusión estratégica</div>
        <div className="ab-content">
          Cartera bien posicionada. Riesgo principal: concentración en 2 posiciones (31%).
          Recomendación: consolidar parcialmente las posiciones con mayor ganancia USD.
        </div>
      </Modal>

      <Toast message={toastMsg} />
    </div>
  )
}
